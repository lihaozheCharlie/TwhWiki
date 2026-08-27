import { spawn } from "node:child_process";
import type { VaultConfig, WikiRun } from "@the-way-here/shared";

export type ValidationResult = NonNullable<WikiRun["validation"]>[number];

export async function runValidationCommands(options: {
  vaultRoot: string;
  knowledgeBaseId: string;
  config: VaultConfig;
  onOutput?: (command: string[], chunk: string) => void;
  onResult?: (result: ValidationResult) => Promise<void> | void;
}): Promise<{ valid: boolean; results: ValidationResult[] }> {
  const results: ValidationResult[] = [];
  for (const command of options.config.validation.commands) {
    if (!command.length) continue;
    const result = await new Promise<{ exitCode: number | null; output: string }>((resolve) => {
      const child = spawn(command[0]!, command.slice(1), {
        cwd: options.vaultRoot,
        env: { ...process.env, THE_WAY_HERE_KNOWLEDGE_BASE: options.knowledgeBaseId },
      });
      let output = "";
      const capture = (chunk: Buffer | string) => {
        const text = chunk.toString();
        output += text;
        options.onOutput?.(command, text);
      };
      child.stdout.on("data", capture);
      child.stderr.on("data", capture);
      child.on("exit", (exitCode) => resolve({ exitCode, output: output.slice(-50_000) }));
      child.on("error", (error) => resolve({ exitCode: null, output: error.message }));
    });
    const entry = { command, ...result };
    results.push(entry);
    await options.onResult?.(entry);
    if (result.exitCode !== 0) return { valid: false, results };
  }
  return { valid: true, results };
}
