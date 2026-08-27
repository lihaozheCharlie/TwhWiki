import { describe, expect, it } from "vitest";
import { prepareImportFiles } from "./import-materials.js";

function storedZip(name: string, content: string): string {
  const nameBytes = Buffer.from(name);
  const body = Buffer.from(content);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(body.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt32LE(body.length, 20);
  central.writeUInt32LE(body.length, 24);
  central.writeUInt16LE(nameBytes.length, 28);
  const localRecord = Buffer.concat([local, nameBytes, body]);
  const centralRecord = Buffer.concat([central, nameBytes]);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(centralRecord.length, 12);
  eocd.writeUInt32LE(localRecord.length, 16);
  return Buffer.concat([localRecord, centralRecord, eocd]).toString("base64");
}

describe("material imports", () => {
  it("extracts Markdown and TXT files from a ZIP while preserving folders", () => {
    const files = prepareImportFiles([{ name: "notes.zip", content: storedZip("archive/note.txt", "hello"), encoding: "base64" }], "files", "2026-08-24T00:00:00.000Z");
    expect(files).toHaveLength(1);
    expect(files[0]?.relativePath).toBe("archive/note.md");
    expect(files[0]?.content).toContain("# note");
    expect(files[0]?.content).toContain("hello");
  });

  it("turns a ChatGPT conversations export into separate Markdown conversations", () => {
    const exportJson = JSON.stringify([{ title: "A useful chat", mapping: {
      first: { message: { author: { role: "user" }, content: { parts: ["Question"] }, create_time: 1 } },
      second: { message: { author: { role: "assistant" }, content: { parts: ["Answer"] }, create_time: 2 } },
    } }]);
    const files = prepareImportFiles([{ name: "conversations.json", content: exportJson }], "chatgpt", "2026-08-24T00:00:00.000Z");
    expect(files).toHaveLength(1);
    expect(files[0]?.relativePath).toBe("A useful chat.md");
    expect(files[0]?.content).toContain("## 我");
    expect(files[0]?.content).toContain("## AI");
    expect(files[0]?.content).toContain("Question");
    expect(files[0]?.content).toContain("Answer");
  });

  it("does not allow ZIP paths to escape the selected folder", () => {
    const files = prepareImportFiles([{ name: "notes.zip", content: storedZip("../../outside.txt", "safe"), encoding: "base64" }], "files", "2026-08-24T00:00:00.000Z");
    expect(files[0]?.relativePath).toBe("outside.md");
  });
});
