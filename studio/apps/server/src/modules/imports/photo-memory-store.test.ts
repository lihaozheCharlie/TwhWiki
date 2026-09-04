import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { WikiIndex } from "@the-way-here/wiki-core";
import { buildRelationships } from "@the-way-here/life-views";
import type { PhotoMemoryOutputTarget } from "@the-way-here/shared";
import { PhotoMemoryStore, validatePhotoPeople } from "./photo-memory-store.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "twh-photo-test-")));
  roots.push(root);
  const index = new WikiIndex(root);
  await index.rebuild();
  const store = new PhotoMemoryStore(root);
  const content = (await sharp({ create: { width: 80, height: 100, channels: 3, background: "#578a83" } }).png().toBuffer()).toString("base64");
  const file = { name: "anonymous.png", content, encoding: "base64" };
  const batch = await store.create(index.config, { title: "匿名测试记忆", files: [file] });
  await index.rebuild();
  const target: PhotoMemoryOutputTarget = { kind: "photo-memory", importId: batch.id, storedPath: batch.files[0]!.storedPath, label: "测试", phase: "analyze" };
  return { root, index, store, file, batch, target, config: index.config };
}
const person = { id: "person-1", name: "测试人物", box: { x: 0.2, y: 0.1, width: 0.5, height: 0.6 }, useAsAvatar: true };

describe("photo memories", () => {
  it("keeps originals local and analysis candidates out of the source report", async () => {
    const { root, store, config, target, batch } = await fixture();
    const prepared = await store.prepare(config, target);
    const input = await store.analysisInput(config, batch.id);
    expect(input.images).toHaveLength(1);
    expect(input.images[0]!.path).toMatch(/photo-1.jpg$/);
    expect(await sharp(input.images[0]!.path).metadata()).toMatchObject({ format: "jpeg", width: 80, height: 100 });
    await store.materialize(config, prepared, '可以聊聊这张照片。<photo-memory>{"photos":[{"id":"photo-1","observation":"画面有一张桌子","question":"这是什么时候拍的？"}]}</photo-memory>');
    expect((await store.read(config, batch.id)).photos[0]?.observation).toContain("桌子");
    expect(await readFile(path.join(root, target.storedPath), "utf8")).not.toContain("桌子");
    await expect(store.assertBuild(config, batch.id, target.storedPath)).rejects.toThrow("确认");
  });

  it("requires explicit story confirmation and rejects stale AI or concurrent writes", async () => {
    const { store, config, target, batch, index } = await fixture();
    const prepared = await store.prepare(config, { ...target, phase: "enrich" });
    const outcomes = await Promise.allSettled([store.update(config, batch.id, { revision: 1, story: "这是我确认的故事。" }, index), store.update(config, batch.id, { revision: 1, story: "另一个窗口的旧稿" }, index)]);
    expect(outcomes.map((r) => r.status)).toEqual(["fulfilled", "rejected"]);
    await expect(store.materialize(config, prepared, "<photo-memory>过时的 AI 草稿</photo-memory>")).rejects.toThrow("已更新");
    await expect(store.assertBuild(config, batch.id, target.storedPath)).resolves.toBeUndefined();
    expect((await store.read(config, batch.id)).confirmedStory).toBe("这是我确认的故事。");
    const fresh = await store.prepare(config, { ...target, phase: "enrich" });
    await store.materialize(config, fresh, "<photo-memory>新的待确认草稿</photo-memory>");
    await expect(store.assertBuild(config, batch.id, target.storedPath)).rejects.toThrow("确认");
  });

  it("preserves an externally edited source report instead of overwriting it", async () => {
    const { root, store, config, target, batch, index } = await fixture();
    await writeFile(path.join(root, target.storedPath), "外部修改，需要保留");
    await expect(store.update(config, batch.id, { revision: 1, story: "新故事" }, index)).rejects.toThrow("外部");
    expect(await readFile(path.join(root, target.storedPath), "utf8")).toBe("外部修改，需要保留");
    expect((await store.read(config, batch.id)).revision).toBe(1);
  });

  it("validates photos, crop boxes, IDs, batches, and knowledge-base ownership", async () => {
    const { store, config, file, batch, target } = await fixture();
    await expect(store.create(config, { files: Array(11).fill(file) })).rejects.toThrow("1–10");
    await expect(store.create(config, { files: [{ ...file, name: "bad.heic" }] })).rejects.toThrow("HEIC");
    await expect(store.create(config, { files: [{ ...file, content: Buffer.from("not an image").toString("base64") }] })).rejects.toThrow("解码");
    await expect(store.create(config, { files: [file], targetFolder: "../escape" })).rejects.toThrow();
    await expect(store.read({ ...config, knowledgeBaseId: "another" }, batch.id)).rejects.toThrow("不属于");
    await expect(store.read(config, "../../outside")).rejects.toThrow("编号");
    await expect(store.assetPath(config, batch.id, "photo-1", "person-1")).rejects.toThrow("不存在");
    await expect(store.prepare(config, { ...target, storedPath: "sources/other.md" })).rejects.toThrow("不一致");
    expect(() => validatePhotoPeople([{ ...person, box: { ...person.box, x: 1 } }])).toThrow("范围");
    expect(() => validatePhotoPeople([{ ...person, box: { ...person.box, width: NaN } }])).toThrow("范围");
    expect(() => validatePhotoPeople([person, person])).toThrow("重复");
    expect(() => validatePhotoPeople([{ ...person, name: "" }])).toThrow("名称");
  });

  it("rejects source folders that traverse symlinks", async () => {
    const { root, store, config, file } = await fixture();
    await mkdir(path.join(root, "outside"));
    await symlink(path.join(root, "outside"), path.join(root, "sources", "linked"));
    await expect(store.create(config, { files: [file], targetFolder: "linked" })).rejects.toThrow("符号链接");
  });

  it("publishes cropped avatars only for user-bound people after a successful build, and supports revocation", async () => {
    const { root, store, config, batch, index } = await fixture();
    const relativePath = "wiki/07 实体/人物/测试人物.md";
    await mkdir(path.dirname(path.join(root, relativePath)), { recursive: true });
    await writeFile(path.join(root, relativePath), "---\ntype: entity\n---\n# 测试人物\n\n匿名演示人物。\n");
    await index.rebuild();
    const page = index.list().find((p) => p.relativePath === relativePath)!;
    expect(page).toBeDefined();
    await store.update(config, batch.id, { revision: 1, photoId: "photo-1", people: [person], story: "一次聚餐的回忆" }, index);
    // Name alone must not silently match an existing person.
    await store.publish(config, batch.id, index);
    expect((await store.read(config, batch.id)).builtPeople).toEqual([]);
    await store.update(config, batch.id, { revision: 3, photoId: "photo-1", people: [{ ...person, pageId: page.id }], story: "一次聚餐的回忆" }, index);
    await store.publish(config, batch.id, index);
    const avatarPath = await store.assetPath(config, batch.id, "photo-1", person.id);
    expect(await sharp(avatarPath).metadata()).toMatchObject({ width: 256, height: 256, format: "jpeg" });
    const view = await store.decorate(config, buildRelationships(index), index);
    const decorated = view.groups.flatMap((g) => g.people).find((p) => p.id === page.id)!;
    expect(decorated.avatarUrl).toContain(person.id);
    expect(decorated.photos).toHaveLength(1);
    await store.update(config, batch.id, { revision: 5, photoId: "photo-1", people: [{ ...person, pageId: page.id, useAsAvatar: false }] }, index);
    await expect(store.assetPath(config, batch.id, "photo-1", person.id)).rejects.toThrow("不存在");
    expect((await store.decorate(config, buildRelationships(index), index)).groups.flatMap((g) => g.people).find((p) => p.id === page.id)?.avatarUrl).toBeUndefined();
  });
});
