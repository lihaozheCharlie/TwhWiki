import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { PiSessionRepository } from "./pi-session-repository.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("PiSessionRepository", () => {
  it("persists one runtime-neutral conversation outside the knowledge files", async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), "the-way-here-pi-session-"));
    temporaryRoots.push(stateRoot);
    const repository = new PiSessionRepository("/anonymous/demo", stateRoot);
    const messages = [{ role: "user", content: "解释演示知识", timestamp: 1 }] as AgentMessage[];
    await repository.save({ id: "session-123", model: "local/qwen3", messages, finalAnswer: "演示回答", status: "completed" });
    await expect(repository.load("session-123")).resolves.toMatchObject({
      id: "session-123",
      model: "local/qwen3",
      messages,
      finalAnswer: "演示回答",
      status: "completed",
    });
  });

  it("rejects session ids that could escape the session directory", async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), "the-way-here-pi-session-"));
    temporaryRoots.push(stateRoot);
    const repository = new PiSessionRepository("/anonymous/demo", stateRoot);
    await expect(repository.load("../escape")).rejects.toThrow("会话 ID 无效");
  });
});
