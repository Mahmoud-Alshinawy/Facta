#!/usr/bin/env node
// Writes latest-facta.json and latest-widgets.json for the updater
// (docs/updater.md, section 1) from the renamed updater files and their .sig:
//   node scripts/make-update-manifests.mjs --tag v1.0.1 --dir updater \
//     --base-url https://github.com/Mahmoud-Alshinawy/Facta/releases/download/v1.0.1
// Fails if any expected file or signature is missing, or if a signature was
// made with a different key than the pubkey both apps trust (updater-keys.mjs).
// --platforms windows
// limits the check to some platforms (local testing only).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { configuredKeyId, signatureKeyErrors } from "./updater-keys.mjs";

/** Fixed asset names, so URLs never depend on GitHub's space handling. */
export const PLATFORMS = {
  windows: { key: "windows-x86_64-nsis", file: (p, v) => `${p}-${v}-windows-x64-setup.exe` },
  macos: { key: "darwin-aarch64-app", file: (p, v) => `${p}-${v}-macos-arm64.app.tar.gz` },
  linux: { key: "linux-x86_64-appimage", file: (p, v) => `${p}-${v}-linux-x64.AppImage` },
};
export const PRODUCTS = { facta: "Facta", widgets: "FactaWidgets" };

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const tag = option("tag");
const dir = option("dir", ".");
const baseUrl = option("base-url")?.replace(/\/$/, "");
const notes = option("notes-url", baseUrl ? baseUrl.replace("/download/", "/tag/") : undefined);
const platforms = (option("platforms", Object.keys(PLATFORMS).join(","))).split(",");
const version = tag?.replace(/^v/, "");
if (!version || !/^\d+\.\d+\.\d+$/.test(version) || !baseUrl) {
  console.error("Usage: make-update-manifests.mjs --tag vX.Y.Z --dir <files> --base-url <url> [--platforms windows,macos,linux]");
  process.exit(1);
}

const missing = [];
const signatures = [];
for (const [product, prefix] of Object.entries(PRODUCTS)) {
  const manifest = {
    version,
    notes: notes ? `See ${notes}` : "",
    pub_date: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    platforms: {},
  };
  for (const platform of platforms) {
    const spec = PLATFORMS[platform];
    if (!spec) {
      missing.push(`unknown platform ${platform}`);
      continue;
    }
    const file = spec.file(prefix, version);
    const sig = join(dir, `${file}.sig`);
    if (!existsSync(join(dir, file))) missing.push(file);
    if (!existsSync(sig)) {
      missing.push(`${file}.sig`);
      continue;
    }
    const signature = readFileSync(sig, "utf8").trim();
    signatures.push([`${file}.sig`, signature]);
    manifest.platforms[spec.key] = {
      signature,
      url: `${baseUrl}/${file}`,
    };
  }
  writeFileSync(join(dir, `latest-${product}.json`), `${JSON.stringify(manifest, null, 2)}\n`);
}
if (missing.length) {
  for (const file of missing) console.error(`::error::Missing updater file: ${file}`);
  process.exit(1);
}
let keyErrors;
try {
  const keyId = configuredKeyId();
  keyErrors = signatureKeyErrors(keyId, signatures);
  if (!keyErrors.length) console.log(`All ${signatures.length} signatures use the apps' key ${keyId}.`);
} catch (error) {
  keyErrors = [error.message];
}
if (keyErrors.length) {
  for (const message of keyErrors) console.error(`::error::${message}`);
  process.exit(1);
}
console.log(`Wrote latest-facta.json and latest-widgets.json for ${version} (${platforms.join(", ")}).`);
