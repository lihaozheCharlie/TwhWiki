import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { VaultConfig } from "@the-way-here/shared";
import { runValidationCommands } from "./validation-runner.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("validation runner", () => {
  it("injects the run-bound knowledge base into every command", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "the-way-here-validation-"));
    temporaryRoots.push(root);
    const config = {
      validation: { commands: [[process.execPath, "-e", "process.stdout.write(process.env.THE_WAY_HERE_KNOWLEDGE_BASE || '')"]] },
    } as VaultConfig;
    const result = await runValidationCommands({ vaultRoot: root, knowledgeBaseId: "demo", config });
    expect(result.valid).toBe(true);
    expect(result.results[0]?.output).toBe("demo");
  });
});
