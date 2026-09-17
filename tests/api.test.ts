import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readToken, consumeToken } from "../src/api/token.ts";
import { bootstrap, PortalError } from "../src/api/portal.ts";
const token = "a".repeat(43);
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
const isCode = (code: string) => (e: unknown) =>
  e instanceof PortalError && e.code === code;
test("accepts a single opaque token, rejects missing, short and duplicate tokens", () => {
  assert.equal(
    readToken(new URL(`https://portal.test/?token=${token}`)),
    token,
  );
  for (const q of [
    "",
    "?token=KD014",
    `?token=${token}&token=${token}`,
    `?token=${token}&customer=KD015`,
  ])
    assert.equal(readToken(new URL("https://portal.test/" + q)), null);
});
test("strips query and fragment from history even when token is invalid", () => {
  let path = "";
  assert.equal(
    consumeToken(
      new URL("https://portal.test/?token=bad#secret"),
      (v) => (path = v),
    ),
    null,
  );
  assert.equal(path, "/");
});
test("requires HTTPS API configuration and valid token before network access", async () => {
  await assert.rejects(bootstrap("", token), isCode("configuration"));
  await assert.rejects(
    bootstrap("http://example.test", token),
    isCode("configuration"),
  );
  await assert.rejects(
    bootstrap("https://api.test", "KD014"),
    isCode("invalid-link"),
  );
});
test("sends bearer only and returns only contract fields", async () => {
  globalThis.fetch = async (input, init) => {
    assert.equal(
      String(input),
      "https://api.test/webhook/customer-portal/bootstrap",
    );
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      `Bearer ${token}`,
    );
    assert.equal(init?.credentials, "omit");
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.redirect, "error");
    return Response.json({
      customer: { name: "Test GmbH", internal: "hidden" },
      leads: [],
      secret: "hidden",
    });
  };
  assert.deepEqual(await bootstrap("https://api.test/webhook/", token), {
    customer: { name: "Test GmbH" },
    leads: [],
  });
});
for (const [status, code] of [
  [401, "invalid-link"],
  [403, "invalid-link"],
  [429, "rate-limit"],
  [500, "service"],
  [502, "service"],
] as const) {
  test(`sanitizes HTTP ${status}`, async () => {
    globalThis.fetch = async () =>
      new Response("sensitive backend detail", { status });
    await assert.rejects(bootstrap("https://api.test", token), isCode(code));
  });
}
test("rejects malformed success responses", async () => {
  for (const body of [
    {},
    { customer: { name: "Test" }, leads: [{ id: "1" }] },
    { customer: { name: "Test" }, leads: "wrong" },
  ]) {
    globalThis.fetch = async () => Response.json(body);
    await assert.rejects(
      bootstrap("https://api.test", token),
      isCode("service"),
    );
  }
  globalThis.fetch = async () => new Response("<html>error</html>");
  await assert.rejects(bootstrap("https://api.test", token), isCode("service"));
});
test("sanitizes network failures and propagates cancellation", async () => {
  globalThis.fetch = async () => {
    throw new Error("secret upstream path");
  };
  await assert.rejects(bootstrap("https://api.test", token), isCode("service"));
  const c = new AbortController();
  c.abort();
  await assert.rejects(
    bootstrap("https://api.test", token, c.signal),
    (e) => e instanceof DOMException && e.name === "AbortError",
  );
});
