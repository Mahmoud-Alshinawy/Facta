// Offline browser regression: build apps/desktop first, then set
// FACTA_PLAYWRIGHT_MODULE and FACTA_BROWSER_EXECUTABLE when needed.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.FACTA_PLAYWRIGHT_MODULE ?? "playwright");
const dir = path.join(root, "apps/desktop/dist/public");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff": "font/woff", ".woff2": "font/woff2", ".svg": "image/svg+xml" };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const file = path.join(dir, pathname === "/" ? "index.html" : pathname);
  if (!file.startsWith(dir + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404); res.end(); return;
  }
  res.writeHead(200, { "Content-Type": types[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
let browser;
try {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  browser = await chromium.launch({ headless: true, ...(process.env.FACTA_BROWSER_EXECUTABLE ? { executablePath: process.env.FACTA_BROWSER_EXECUTABLE } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route("**/*", (route) => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const exp = Math.floor(Date.now() / 1000) + 86400;
    const id = "00000000-0000-4000-8000-000000000001";
    const payload = btoa(JSON.stringify({ sub: id, exp })).replace(/=/g, "");
    localStorage.setItem("sb-placeholder-auth-token", JSON.stringify({
      access_token: `eyJhbGciOiJub25lIn0.${payload}.signature`, refresh_token: "fixture",
      expires_at: exp, expires_in: 86400, token_type: "bearer",
      user: { id, email: "fixture@example.invalid", app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: "2025-01-01T00:00:00Z" },
    }));
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "networkidle" });
  await page.locator('nav[aria-label="Main"] button').filter({ hasText: "Notes" }).click();
  const list = page.getByRole("region", { name: "Note list" });
  const editor = page.getByRole("region", { name: "Editor" });
  const grid = page.locator(".notes-page .ngrid");
  const back = page.getByRole("button", { name: "Back to all notes" });
  const listButton = page.getByRole("group", { name: "Notes layout" }).getByRole("button", { name: "List" });
  const noList = async (label) => { await editor.waitFor(); assert.equal(await list.count(), 0, label); };
  await page.getByRole("button", { name: "New note" }).first().click();
  await noList("Creating a note must not reveal the list");
  await page.getByLabel("Note title").fill("Browser fixture note");
  await back.click(); await grid.waitFor();
  assert.equal(await grid.getByRole("option", { selected: true }).count(), 1, "Back keeps the selected note");
  await listButton.click(); await list.waitFor();
  await page.getByRole("button", { name: "New note" }).first().click();
  await noList("Creating from list must close it");
  await back.click(); await grid.waitFor();
  await page.getByRole("group", { name: "Notes layout" }).focus();
  await page.keyboard.press("g"); await list.waitFor();
  await page.keyboard.press("["); await noList("Collapse shortcut hides the list");
  await page.keyboard.press("["); await list.waitFor();
  await page.keyboard.press("Control+."); await page.keyboard.press("Escape");
  await noList("Leaving focus mode must not reveal the list");
  await page.keyboard.press("Control+Shift+N");
  await page.getByLabel("Capture text").fill("Captured fixture");
  await page.getByRole("button", { name: "Save note" }).click();
  await noList("Quick capture must not reveal the list");
  await page.keyboard.press("Control+p");
  await page.getByRole("combobox", { name: "Jump to a note" }).fill("Browser fixture note");
  await page.keyboard.press("Enter");
  await noList("Quick switcher must not reveal the list");
  await page.getByRole("button", { name: "Move to trash" }).click();
  await page.getByRole("button", { name: /Undo/ }).click();
  await noList("Undo must not reveal the list");
  await back.click(); await grid.waitFor();
  await grid.getByRole("option", { selected: true }).click();
  await noList("Opening from the grid must not reveal the list");
  await back.click(); await grid.waitFor();
  await page.keyboard.press("Control+."); await page.keyboard.press("Escape");
  await noList("Focus mode opened from the grid must not reveal the list");
  await back.click(); await grid.waitFor();
  await page.keyboard.press("["); await list.waitFor();
  await page.keyboard.press("g"); await grid.waitFor();
  await page.keyboard.press("["); await list.waitFor();
  assert.deepEqual(errors, [], "No unhandled browser errors");
  console.log("Notes navigation: creation, back, list, shortcuts, capture, switcher and undo passed.");
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
