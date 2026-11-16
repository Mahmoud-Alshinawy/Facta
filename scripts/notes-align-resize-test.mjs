// Offline desktop/widget acceptance and screenshots. Build both frontends first.
// Set FACTA_PLAYWRIGHT_MODULE and FACTA_BROWSER_EXECUTABLE to existing tooling.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { chromium } = createRequire(import.meta.url)(process.env.FACTA_PLAYWRIGHT_MODULE ?? "playwright");
const output = path.join(root, "apps/desktop/dist");
assert.ok(fs.existsSync(output), "Build desktop before running acceptance checks");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff": "font/woff", ".woff2": "font/woff2", ".svg": "image/svg+xml" };
const servers = [];
async function serve(dir) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    const file = path.resolve(dir, "." + decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname));
    if (!file.startsWith(dir + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404); res.end(); return;
    }
    res.writeHead(200, { "Content-Type": types[path.extname(file)] ?? "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}/`;
}
const title = "Paragraph alignment and writing width";
const lines = ["Left — Plan the day with a clear intention.", "Centre — Protect time for focused work.", "Right — Finish with a short review."];
const userId = "00000000-0000-4000-8000-000000000001";
const shots = [];
const measurements = [];
let browser;
try {
  const desktopUrl = await serve(path.join(root, "apps/desktop/dist/public"));
  const widgetUrl = await serve(path.join(root, "apps/widgets/dist"));
  browser = await chromium.launch({ headless: true, ...(process.env.FACTA_BROWSER_EXECUTABLE ? { executablePath: process.env.FACTA_BROWSER_EXECUTABLE } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  await context.addInitScript(({ userId }) => {
    const exp = Math.floor(Date.now() / 1000) + 86400;
    const payload = btoa(JSON.stringify({ sub: userId, exp })).replace(/=/g, "");
    localStorage.setItem("sb-placeholder-auth-token", JSON.stringify({
      access_token: `eyJhbGciOiJub25lIn0.${payload}.signature`, refresh_token: "fixture",
      expires_at: exp, expires_in: 86400, token_type: "bearer",
      user: { id: userId, email: "fixture@example.invalid", app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: "2025-01-01T00:00:00Z" },
    }));
  }, { userId });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(desktopUrl, { waitUntil: "networkidle" });
  await page.locator('nav[aria-label="Main"] button').filter({ hasText: "Notes" }).click();
  await page.getByRole("button", { name: "New note" }).first().click();
  await page.getByLabel("Note title", { exact: true }).fill(title);
  const body = page.getByRole("textbox", { name: "Note body" });
  await body.fill(lines[0]);
  await page.getByRole("button", { name: "Align left", exact: true }).click();
  for (const [index, align] of [[1, "center"], [2, "right"]]) {
    await body.press("End"); await body.press("Enter");
    await page.keyboard.insertText(lines[index]);
    await page.getByRole("button", { name: `Align ${align}`, exact: true }).click();
  }
  await page.waitForFunction(() => [...document.querySelectorAll('.tiptap > p')].map(p => p.style.textAlign).join() === "left,center,right");
  const handle = page.getByRole("separator", { name: "Writing area width" });
  const width = async () => Number(await handle.getAttribute("aria-valuenow"));
  const settled = () => page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  async function capture(viewport, mode) {
    await settled();
    const sizes = await page.evaluate(() => {
      const pane = document.querySelector('.notes-page .nbody');
      const article = pane.querySelector('.ndoc').getBoundingClientRect();
      const bounds = pane.getBoundingClientRect();
      return { width: article.width, pane: pane.clientWidth, center: article.x + article.width / 2 - (bounds.x + pane.clientWidth / 2) };
    });
    assert.ok(sizes.width <= sizes.pane - 24 + 1, "column stays within available pane");
    assert.ok(Math.abs(sizes.center) <= 2, "resizing keeps the column centered");
    const file = path.join(output, `facta-notes-${viewport}-${mode}.png`);
    await page.screenshot({ path: file, animations: "disabled" });
    shots.push(file); measurements.push({ viewport, mode, ...sizes });
  }
  for (const viewport of [1440, 1100]) {
    await page.setViewportSize({ width: viewport, height: 1000 });
    await handle.focus(); await handle.press("Home"); await settled();
    const initial = await width();
    assert.equal(initial, Math.min(720, Number(await handle.getAttribute("aria-valuemax"))));
    await capture(viewport, "default");
    const bounds = await handle.boundingBox();
    const delta = Math.min(60, Math.max(0, (Number(await handle.getAttribute("aria-valuemax")) - initial) / 2));
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 28);
    await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width / 2 + delta, bounds.y + 28, { steps: 8 }); await page.mouse.up();
    await settled(); assert.ok(await width() >= initial, "right-edge drag widens the column");
    await capture(viewport, "widened");
    await handle.focus(); await handle.press("Home");
    for (let i = 0; i < 15; i++) await handle.press("ArrowLeft");
    assert.equal(await width(), Number(await handle.getAttribute("aria-valuemin")));
    await capture(viewport, "narrowed");
  }
  // Width applies to every note, and survives an editor remount and a reload.
  await page.getByRole("button", { name: "Back to all notes" }).click();
  await page.getByRole("button", { name: "New note" }).first().click();
  assert.equal(await width(), 480);
  await handle.dblclick(); assert.equal(await width(), 720);
  await handle.focus(); await handle.press("ArrowRight"); assert.equal(await width(), 744);
  await page.reload({ waitUntil: "networkidle" });
  await page.locator('nav[aria-label="Main"] button').filter({ hasText: "Notes" }).click();
  await page.getByRole("option").filter({ hasText: title }).click();
  await settled(); assert.equal(await width(), 744, "width persists after reload");
  await page.setViewportSize({ width: 800, height: 1000 }); await settled();
  assert.ok(await width() <= Number(await handle.getAttribute("aria-valuemax")), "window shrink reclamps width");
  await page.setViewportSize({ width: 1440, height: 1000 }); await settled();
  assert.equal(await width(), 744, "temporary pane shrink keeps the preferred width");
  await handle.focus(); await handle.press("Home");
  const fixtureNote = await page.evaluate(async ({ userId, title }) => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open("facta-planner", 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const raw = await new Promise((resolve, reject) => { const request = db.transaction("kv", "readonly").objectStore("kv").get(`planner_notes_${userId}`); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    db.close(); return JSON.parse(raw).find(note => note.title === title);
  }, { userId, title });
  assert.deepEqual(fixtureNote.body.map(block => block.align), ["left", "center", "right"]);
  assert.equal(fixtureNote.align, null, "toolbar does not change note-level alignment");
  // A mixed selection has no active alignment; applying alignment updates all three.
  await body.focus(); await body.press("Control+a");
  await page.waitForFunction(() => [...document.querySelectorAll('.note-alignments button')].every(button => button.getAttribute('aria-pressed') === 'false'));
  await page.getByRole("button", { name: "Align center", exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('.tiptap > p')].every(p => p.style.textAlign === "center"));
  // Long text verifies that the toolbar remains sticky after resizing.
  await body.press("Control+End"); await body.press("Enter");
  await page.keyboard.insertText(Array.from({ length: 65 }, (_, i) => `Writing line ${i + 1}`).join("\n"));
  await page.locator('.notes-page .nbody').evaluate(element => { element.scrollTop = 600; });
  await settled();
  const sticky = await page.evaluate(() => ({ pane: document.querySelector('.notes-page .nbody').getBoundingClientRect().top, toolbar: document.querySelector('.note-toolbar').getBoundingClientRect().top }));
  assert.ok(Math.abs(sticky.toolbar - sticky.pane) < 2, "toolbar stays at pane top");
  // The real Notes widget intentionally receives a plain-text projection.
  const preview = fixtureNote.body.map(block => block.content.map(inline => inline.type === "text" ? inline.text : inline.label).join("")).join("\n");
  const widgetContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await widgetContext.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  await widgetContext.addInitScript(({ fixtureNote, preview, userId }) => {
    const data = { user_id: userId, exported_at_ms: Date.now(), journal: {
      notes: [{ id: fixtureNote.id, title: fixtureNote.title, preview, color: fixtureNote.color, pinned: true, truncated: false, words: 25, updatedAt: fixtureNote.updatedAt }],
      recentIds: [fixtureNote.id], noteCount: 1, omittedPinned: 0, diary: { date: new Date().toLocaleDateString("en-CA"), today: null, past: [] },
    }, config: { widgets: [{ id: "fixture", theme: "midnight", translucent: false, noteStyle: "sticky" }] } };
    window.__TAURI_INTERNALS__ = { invoke: async command => command === "read_shared_data" ? data : null,
      metadata: { currentWindow: { label: "widget-fixture" }, currentWebview: { label: "widget-fixture", windowLabel: "widget-fixture" } } };
  }, { fixtureNote, preview, userId });
  const widget = await widgetContext.newPage();
  widget.on("pageerror", error => errors.push(error.message));
  await widget.goto(widgetUrl + "?widget=notes&theme=midnight&translucent=false&noteStyle=sticky", { waitUntil: "networkidle" });
  await widget.getByLabel("Note preview", { exact: true }).waitFor();
  assert.equal(await widget.getByLabel("Note preview", { exact: true }).inputValue(), preview);
  for (const viewport of [1440, 1100]) {
    await widget.setViewportSize({ width: viewport, height: 1000 });
    await widget.evaluate(() => document.fonts.ready);
    const file = path.join(output, `facta-notes-widget-${viewport}.png`);
    await widget.screenshot({ path: file, animations: "disabled" }); shots.push(file);
  }
  assert.deepEqual(errors, [], "no unhandled browser errors");
  console.log(JSON.stringify({ ok: true, measurements, screenshots: shots }, null, 2));
} finally {
  await browser?.close();
  await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
}
