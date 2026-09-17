import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/production",
  use: {
    headless: true,
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--no-zygote"],
    },
  },
  webServer: {
    command:
      "VITE_API_BASE_URL=https://portal-api.test/webhook npm run build && PORT=4174 FRAME_ANCESTORS=https://learning.test API_ORIGIN=https://portal-api.test node server.mjs",
    url: "http://127.0.0.1:4174/healthz",
    reuseExistingServer: false,
  },
  reporter: "list",
});
