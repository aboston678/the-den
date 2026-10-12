import { defineConfig, devices } from "@playwright/test";

// Starts the game server and the website, then runs the browser tests in e2e/.
// BASE_URL=https://… runs them against another copy (e.g. the deployed site) without starting anything.
const remote = process.env.BASE_URL;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1, // tests share one game server and party room
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: remote ?? "http://localhost:5173",
    viewport: { width: 1280, height: 720 },
    // Use the Mac's GPU so the 3D scene runs at real frame rates in tests.
    launchOptions: process.platform === "darwin" ? { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } : {},
  },
  webServer: remote ? [] : [
    {
      command: "npm run dev -w server",
      url: "http://localhost:2567/health",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: "npm run dev -w client",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
