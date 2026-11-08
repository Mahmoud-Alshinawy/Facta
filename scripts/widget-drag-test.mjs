// Browser hit-testing for widget drag handles; build apps/widgets first.
// No native app is launched and the Tauri calls below are in-memory fixtures.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { chromium } = createRequire(import.meta.url)(process.env.FACTA_PLAYWRIGHT_MODULE ?? "playwright");
const dir = path.join(root, "apps/widgets/dist");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff": "font/woff", ".woff2": "font/woff2" };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const file = path.join(dir, pathname === "/" ? "index.html" : pathname);
  if (!file.startsWith(dir + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": types[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
let browser;
try {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  browser = await chromium.launch({ headless: true, ...(process.env.FACTA_BROWSER_EXECUTABLE ? { executablePath: process.env.FACTA_BROWSER_EXECUTABLE } : {}) });
  const context = await browser.newContext({ viewport: { width: 380, height: 460 } });
  await context.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    const user = "11111111-1111-4111-8111-111111111111", id = "33333333-3333-4333-8333-333333333333", id2 = "44444444-4444-4444-8444-444444444444";
    const group = { groupId: id, revision: 1, name: "Walk", timeZone: "UTC", today: "2026-10-20", phase: "active", reason: null, confirmedAt: 1792520000000, archived: false, pending: false, stale: false, round: { start: "2026-10-19", end: "2026-10-26", activityEnd: "2026-10-26T00:00:00Z", endReason: "scheduled", active: true, averagePct: 50 }, rows: [{ userId: user, name: "You", rank: 1, adherencePct: 50, isAtLeast70: false, self: true, left: false, completedDays: 1, target: 2 }] };
    const d = new Date(), today = [d.getFullYear(), String(d.getMonth()+1).padStart(2,"0"), String(d.getDate()).padStart(2,"0")].join("-");
    const note = { id: "note-fixture", title: "Example note", preview: "A small note", color: "a", pinned: true, truncated: false, words: 3, updatedAt: d.toISOString() };
    window.__calls = [];
    window.__TAURI_INTERNALS__ = { metadata: { currentWindow: { label: "widget-test" }, currentWebview: { label: "widget-test" } }, transformCallback: () => 1, unregisterCallback: () => {}, invoke: async (cmd, args) => {
      window.__calls.push({ cmd, args });
      if (cmd === "read_shared_data") return { user_id: user, exported_at_ms: Date.now(), goals: [], events: [], config: { widgets: [] }, shared_goals: { version: 1, userId: user, defaultGroupId: id, groups: [group, { ...group, groupId: id2, name: "Read" }], truncated: false, unavailable: false }, journal: { notes: [note], recentIds: [note.id], noteCount: 1, omittedPinned: 0, diary: { date: today, today: null, past: [] } } };
      return null;
    } };
  });
  const url = `http://127.0.0.1:${server.address().port}/`;
  const cases = [
    ["tasks", "[data-tauri-drag-region]"], ["events", "[data-tauri-drag-region]"], ["calendar", "[data-tauri-drag-region]"],
    ["progress", ".progress-head svg"], ["progress", ".progress-head span"],
    ["dayview", ".wg-head svg"], ["dayview", ".wg-date"], ["dayview", ".wg-head span:last-child"],
    ["notes", ".jw-drag svg"], ["notes", ".jw-drag"], ["diary", ".jw-drag svg"], ["diary", ".jw-drag"],
  ];
  let previous = "";
  for (const [type, selector] of cases) {
    if (previous !== type) { await page.goto(`${url}?widget=${type}&theme=light&translucent=true`, { waitUntil: "networkidle" }); previous = type; }
    const target = page.locator(selector).first(); await target.waitFor();
    const box = await target.boundingBox(); assert.ok(box, `${type}: ${selector} must be visible`);
    const hit = await page.evaluate(({ x, y }) => {
      const element = document.elementFromPoint(x, y);
      return { tag: element?.tagName, draggable: element?.hasAttribute("data-tauri-drag-region") };
    }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    assert.equal(hit.draggable, true, `${type}: ${selector} must hit a Tauri drag region (hit ${hit.tag})`);
  }
  await page.goto(`${url}?widget=progress&theme=light&translucent=true`, { waitUntil: "networkidle" });
  const picker = page.getByRole("combobox", { name: "Progress shared group" });
  await picker.selectOption("44444444-4444-4444-8444-444444444444");
  const open = page.getByRole("button", { name: "Open group" }); await open.click();
  assert.ok(await page.evaluate(() => window.__calls.some(c => c.cmd === "open_main_app" && c.args?.groupId === "44444444-4444-4444-8444-444444444444")), "Open group remains clickable after choosing a group");
  assert.deepEqual(errors, [], "No unhandled browser errors");
  console.log("Widget drag hit targets and Progress controls passed for all seven types.");
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
