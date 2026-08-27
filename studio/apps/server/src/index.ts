import path from "node:path";
import { fileURLToPath } from "node:url";
import { StudioServer } from "./studio-server.js";

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const vaultRoot = path.resolve(process.env.THE_WAY_HERE_VAULT || path.resolve(serverDir, "../../../.."));
const host = "127.0.0.1";
const port = Number.parseInt(process.env.THE_WAY_HERE_PORT || "4321", 10);

const server = await StudioServer.create({
  vaultRoot,
  knowledgeBaseId: process.env.THE_WAY_HERE_KNOWLEDGE_BASE,
  development: Boolean(process.env.THE_WAY_HERE_DEV),
});

const shutdown = async () => server.close();
process.on("SIGINT", () => void shutdown().finally(() => process.exit(0)));
process.on("SIGTERM", () => void shutdown().finally(() => process.exit(0)));

await server.listen(host, port);
