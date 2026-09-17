import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.routeWebSocket("wss://*.supabase.co/**", () => {});
});
const token = "a".repeat(43);
const lead = (id: string, name: string, status: string) => ({
  id,
  name,
  contactName: "Anna Beispiel",
  status,
  website: "https://example.org",
  notes: "Interesse an einem persönlichen Gespräch. Rückmeldung nächste Woche.",
  email: "anna@example.org",
  phone: "+49 30 123456",
  position: "Geschäftsführung",
  source: "LinkedIn",
});
const payload = {
  customer: { name: "Beispiel Maschinenbau GmbH" },
  leads: [
    lead("1", "Nordlicht Präzision GmbH", "Neu"),
    lead("2", "Bergmann Technik", "Kontaktiert"),
    lead("3", "Hafenwerk Industrie", "Termin vereinbart"),
    lead("4", "Westfeld Engineering", "Gewonnen"),
  ],
};

test("realtime invalidation refreshes through the authorized API without reloading", async ({ page }) => {
  let current = payload;
  let invalidate: (() => void) | undefined;
  await page.routeWebSocket("wss://*.supabase.co/**", socket => {
    socket.onMessage(() => {});
    invalidate = () => socket.send(JSON.stringify({
      event: "postgres_changes", topic: "realtime:public:portal_events", payload: {},
    }));
  });
  await page.route("https://portal-api.test/**", route => {
    expect(route.request().headers().authorization).toBe("Bearer " + token);
    return route.fulfill({ json: current });
  });
  await page.goto("/?token=" + token);
  await expect(page.locator("tbody tr")).toHaveCount(4);
  current = { ...payload, leads: [...payload.leads, lead("5", "Realtime lead", "Neu")] };
  await expect.poll(() => typeof invalidate).toBe("function");
  invalidate!();
  await expect(page.locator("tbody tr")).toHaveCount(5);
});

test("open portal refreshes in the background and removes data after revocation", async ({ page }) => {
  await page.clock.install();
  let revoked = false;
  let current = payload;
  await page.route("https://portal-api.test/**", route => revoked
    ? route.fulfill({ status: 401, json: { error: "unauthorized" } })
    : route.fulfill({ json: current }));
  await page.goto("/?token=" + token);
  await expect(page.locator("tbody tr")).toHaveCount(4);
  current = { ...payload, leads: [...payload.leads, lead("5", "Newly synced lead", "Neu")] };
  await page.clock.runFor(61000);
  await expect(page.locator("tbody tr")).toHaveCount(5);
  revoked = true;
  await page.clock.runFor(61000);
  await expect(page.getByRole("heading", { name: "Dieser Link ist nicht gültig" })).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(0);
});

test("desktop search, filter, sorting and safe token transport", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("https://portal-api.test/**", async (route) => {
    expect(route.request().headers().authorization).toBe(`Bearer ${token}`);
    expect(route.request().url()).not.toContain("token");
    await route.fulfill({ json: payload });
  });
  await page.goto("/?token=" + token);
  await expect(page.getByRole("heading", { name: "Alle Interessenten" })).toBeVisible();
  expect(page.url()).not.toContain("token");
  await expect(page.locator("tbody tr")).toHaveCount(4);
  await page.getByRole("searchbox").fill("Nordlicht");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("searchbox").fill("");
  await page.getByLabel("Status", { exact: true }).selectOption("Gewonnen");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByLabel("Status", { exact: true }).selectOption("");
  await page.getByRole("button", { name: "Interessent / Kontakt" }).click();
  await expect(page.locator("tbody tr").first()).toContainText("Westfeld");
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  expect(errors).toEqual([]);
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
});

test("restricted admin view labels and filters leads by customer", async ({ page }) => {
  const adminPayload = {
    mode: "admin",
    customer: { name: "Schulze Marketing" },
    clients: [
      { id: "recAAAAAAAAAAAAAA", clientId: "KD-001", name: "Alpha GmbH" },
      { id: "recBBBBBBBBBBBBBB", clientId: "KD-002", name: "Beta GmbH" },
    ],
    leads: [
      { ...lead("admin-1", "Alpha Lead", "Neu"), clientRecordId: "recAAAAAAAAAAAAAA", clientName: "Alpha GmbH" },
      { ...lead("admin-2", "Beta Lead", "Kontaktiert"), clientRecordId: "recBBBBBBBBBBBBBB", clientName: "Beta GmbH" },
    ],
  };
  await page.route("https://portal-api.test/**", (route) => route.fulfill({ json: adminPayload }));
  await page.goto("/?token=" + token);
  await expect(page.getByRole("heading", { name: "Alle Kunden-Interessenten" })).toBeVisible();
  await expect(page.getByText("Admin-Leseansicht")).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await page.getByLabel("Kunde", { exact: true }).selectOption("recBBBBBBBBBBBBBB");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody tr").first()).toContainText("Beta GmbH");
  await expect(page.locator("tbody tr").first()).toContainText("Beta Lead");
});

test("mobile cards fit and search works", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("https://portal-api.test/**", (r) => r.fulfill({ json: payload }));
  await page.goto("/?token=" + token);
  await expect(page.locator(".lead-card")).toHaveCount(4);
  await expect(page.locator(".table-wrap")).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
});

test("invalid link makes no API request and 401 shows invalid state", async ({ page }) => {
  let requests = 0;
  await page.route("https://portal-api.test/**", (r) => {
    requests++;
    return r.fulfill({ status: 401, json: { error: "unauthorized" } });
  });
  await page.goto("/?customer=KD015");
  await expect(page.getByRole("heading", { name: "Dieser Link ist nicht gültig" })).toBeVisible();
  expect(requests).toBe(0);
  await page.goto("/?token=" + token);
  await expect(page.getByRole("heading", { name: "Dieser Link ist nicht gültig" })).toBeVisible();
});

test("empty and service-error states are distinct", async ({ page }) => {
  await page.route("https://portal-api.test/**", (r) => r.fulfill({ json: { customer: { name: "Test GmbH" }, leads: [] } }));
  await page.goto("/?token=" + token);
  await expect(page.getByText("Hier beginnt Ihre Übersicht")).toBeVisible();
  await page.unroute("https://portal-api.test/**");
  await page.route("https://portal-api.test/**", (r) => r.fulfill({ status: 503, body: "internal details" }));
  await page.goto("/?token=" + token);
  await expect(page.getByRole("button", { name: "Erneut versuchen" })).toBeVisible();
  await expect(page.getByText("internal details")).toHaveCount(0);
});

test("renders inside an iframe without third-party cookies", async ({ page }) => {
  await page.route("https://portal-api.test/**", (r) => r.fulfill({ json: payload }));
  await page.goto("/");
  await page.setContent(`<iframe title="Vertriebsportal" src="http://127.0.0.1:4173/?token=${token}" width="100%" height="900"></iframe>`);
  await expect(page.frameLocator("iframe").getByRole("heading", { name: "Alle Interessenten" })).toBeVisible();
});

test("long customer and lead names never overflow mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("https://portal-api.test/**", (r) =>
    r.fulfill({ json: { ...payload, customer: { name: "Industrieautomatisierungsgesellschaft Beispiel GmbH" } } }),
  );
  await page.goto("/?token=" + token);
  await expect(page.locator(".lead-card")).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("German and English switch preserves filtered data and bearer session", async ({ page }) => {
  let calls = 0;
  await page.route("https://portal-api.test/**", async route => {
    calls++;
    expect(route.request().headers().authorization).toBe(`Bearer ${token}`);
    await route.fulfill({ json: payload });
  });
  await page.goto("/?token=" + token);
  await expect(page.locator("tbody tr")).toHaveCount(4);
  await page.getByLabel("Status", { exact: true }).selectOption("Gewonnen");
  const callsBeforeSwitch = calls;
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { name: "All leads", exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Lead / contact" })).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody tr")).toContainText("Won");
  await expect(page.getByRole("searchbox")).toHaveAttribute("placeholder", "Search name, company or contact …");
  await page.getByRole("button", { name: "Deutsch", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.getByLabel("Status", { exact: true })).toHaveValue("Gewonnen");
  expect(calls).toBe(callsBeforeSwitch);
});

test("English invalid-link and mobile layout remain usable", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.getByRole("heading", { name: "This link is not valid" })).toBeVisible();
  await expect(page).toHaveTitle("Schulze Marketing · Sales portal");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});


test("English status search and unknown status values are safe", async ({ page }) => {
  await page.route("https://portal-api.test/**", route => route.fulfill({ json: {
    ...payload, leads: [...payload.leads, lead("5", "Custom status lead", "__proto__")],
  } }));
  await page.goto("/?token=" + token);
  await expect(page.locator("tbody tr")).toHaveCount(5);
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(5);
  await page.getByRole("searchbox").fill("Meeting scheduled");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody tr")).toContainText("Hafenwerk");
  await page.getByRole("searchbox").fill("__proto__");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody tr")).toContainText("Custom status lead");
});
