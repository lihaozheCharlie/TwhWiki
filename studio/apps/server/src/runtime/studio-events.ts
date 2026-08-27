import type { FastifyReply, FastifyRequest } from "fastify";

export class StudioEvents {
  private readonly clients = new Set<FastifyReply>();

  broadcast(event: string, data: unknown): void {
    for (const client of this.clients) {
      client.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  }

  connect(request: FastifyRequest, reply: FastifyReply): void {
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    reply.raw.write("retry: 2000\n\n");
    this.clients.add(reply);
    const keepAlive = setInterval(() => reply.raw.write(": keep-alive\n\n"), 20_000);
    request.raw.on("close", () => {
      clearInterval(keepAlive);
      this.clients.delete(reply);
    });
  }
}
