import { test, expect } from "@playwright/test";
const token = "a".repeat(43);
const html = (parent: string) =>
  `<!doctype html><title>${parent}</title><iframe title="Portal" src="https://portal.test/?token=${token}" width="1000" height="900"></iframe>`;
test("production headers, allowed cross-origin iframe and blocked unrelated parent", async ({
  page,
  request,
}) => {
  const response = await request.get("http://127.0.0.1:4174/?token=REDACTED");
  expect(response.status()).toBe(200);
  const h = response.headers();
  expect(h["content-security-policy"]).toContain(
    "frame-ancestors https://learning.test",
  );
  expect(h["content-security-policy"]).toContain(
    "connect-src 'self' https://portal-api.test",
  );
  expect(h["referrer-policy"]).toBe("no-referrer");
  expect(h["cache-control"]).toBe("no-store");
  expect(h["x-frame-options"]).toBeUndefined();
  expect(h["x-content-type-options"]).toBe("nosniff");
  await page.route("https://portal.test/**", async (route) => {
    const u = new URL(route.request().url());
    const upstream = await request.get(
      "http://127.0.0.1:4174" + u.pathname + u.search,
    );
    await route.fulfill({ response: upstream });
  });
  await page.route("https://portal-api.test/**", (route) =>
    route.fulfill({
      json: { customer: { name: "Sicheres Beispiel GmbH" }, leads: [] },
    }),
  );
  await page.route("https://learning.test/", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: html("Authorized parent"),
    }),
  );
  await page.goto("https://learning.test/");
  await expect(
    page.frameLocator("iframe").getByText("Hier beginnt Ihre Übersicht"),
  ).toBeVisible();
  const blockedMessages: string[] = [];
  page.on("console", (msg) => {
    if (msg.text().includes("frame-ancestors"))
      blockedMessages.push(msg.text());
  });
  await page.route("https://unrelated.test/", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: html("Unauthorized parent"),
    }),
  );
  await page.goto("https://unrelated.test/");
  await expect.poll(() => blockedMessages.length).toBeGreaterThan(0);
  await expect(
    page.frameLocator("iframe").getByText("Hier beginnt Ihre Übersicht"),
  ).toHaveCount(0);
});
