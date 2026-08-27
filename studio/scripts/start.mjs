import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveKnowledgeBase, resolveVault, resolvePort } from "./args.mjs";

const vault = resolveVault();
const port = resolvePort();
const knowledgeBase = resolveKnowledgeBase();
const serverEntry = new URL("../apps/server/dist/index.js", import.meta.url);
const child = spawn(process.execPath, [fileURLToPath(serverEntry)], {
  cwd: process.cwd(),
  env: { ...process.env, THE_WAY_HERE_VAULT: vault, THE_WAY_HERE_KNOWLEDGE_BASE: knowledgeBase, THE_WAY_HERE_PORT: String(port) },
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code) => process.exit(code ?? 0));
