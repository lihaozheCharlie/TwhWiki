import { spawn } from "node:child_process";
import { resolveKnowledgeBase, resolveVault } from "./args.mjs";

const vault = resolveVault();
const knowledgeBase = resolveKnowledgeBase();
const env = { ...process.env, THE_WAY_HERE_VAULT: vault, THE_WAY_HERE_KNOWLEDGE_BASE: knowledgeBase, THE_WAY_HERE_DEV: "1" };
const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const child = spawn(
  command,
  ["exec", "concurrently", "-k", "-n", "server,web", "-c", "green,blue", "pnpm --dir apps/server dev", "pnpm --dir apps/web dev"],
  { cwd: process.cwd(), env, stdio: "inherit" },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code) => process.exit(code ?? 0));
