import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api request headers", () => {
  it("does not describe a bodyless DELETE as JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await api("/api/vault/personal", { method: "DELETE" });

    const [, init] = fetchMock.mock.calls[0]!;
    expect(new Headers(init.headers).has("Content-Type")).toBe(false);
  });

  it("adds the JSON content type when a request has a body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await api("/api/vault/select", { method: "POST", body: JSON.stringify({ knowledgeBaseId: "personal" }) });

    const [, init] = fetchMock.mock.calls[0]!;
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
  });
});
