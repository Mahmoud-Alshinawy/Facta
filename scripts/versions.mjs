// Shared helpers for check-versions.mjs and bump-version.mjs (docs/updater.md,
// section 7). Each app's version lives in its package.json; tauri.conf.json
// points there. Cargo.toml and Cargo.lock are kept equal for tidiness.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export const apps = [
  { name: "Facta", dir: "apps/desktop", crate: "facta" },
  { name: "Facta Widgets", dir: "apps/widgets", crate: "facta-widgets" },
];

export const read = (path) => readFileSync(join(root, path), "utf8");

export const SEMVER = /^\d+\.\d+\.\d+$/;

export function packageVersion(text) {
  return JSON.parse(text).version;
}

/** The `version` in Cargo.toml's [package] table. */
export function cargoTomlVersion(text) {
  const table = text.split(/^\[/m).find((part) => part.startsWith("package]"));
  return table?.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
}

/** The version Cargo.lock records for one crate. */
export function cargoLockVersion(text, crate) {
  const escaped = crate.replace(/[-]/g, "\\-");
  return text.match(new RegExp(`\\[\\[package\\]\\]\\r?\\nname = "${escaped}"\\r?\\nversion = "([^"]+)"`))?.[1];
}

export function setCargoTomlVersion(text, version) {
  return text.replace(/(\[package\][^[]*?^version\s*=\s*")[^"]+(")/m, `$1${version}$2`);
}

export function setCargoLockVersion(text, crate, version) {
  const escaped = crate.replace(/[-]/g, "\\-");
  return text.replace(
    new RegExp(`(\\[\\[package\\]\\]\\r?\\nname = "${escaped}"\\r?\\nversion = ")[^"]+(")`),
    `$1${version}$2`,
  );
}

export function setPackageVersion(text, version) {
  return text.replace(/("version"\s*:\s*")[^"]+(")/, `$1${version}$2`);
}

/** Every place a version or updater setting lives, per app. */
export function collect() {
  return apps.map((app) => {
    const conf = JSON.parse(read(`${app.dir}/src-tauri/tauri.conf.json`));
    return {
      ...app,
      packageJson: packageVersion(read(`${app.dir}/package.json`)),
      tauriConf: conf.version,
      cargoToml: cargoTomlVersion(read(`${app.dir}/src-tauri/Cargo.toml`)),
      cargoLock: cargoLockVersion(read(`${app.dir}/src-tauri/Cargo.lock`), app.crate),
      pubkey: conf.plugins?.updater?.pubkey ?? "",
      endpoints: conf.plugins?.updater?.endpoints ?? [],
    };
  });
}

/** Problems, as plain sentences; empty when everything agrees. */
export function problems(found, { tag, release } = {}) {
  const out = [];
  const want = tag ? tag.replace(/^v/, "") : found[0]?.packageJson;
  if (tag && !SEMVER.test(want)) out.push(`Tag ${tag} is not vX.Y.Z.`);
  for (const app of found) {
    if (!SEMVER.test(app.packageJson ?? ""))
      out.push(`${app.name}: package.json version "${app.packageJson}" is not X.Y.Z.`);
    if (app.tauriConf !== "../package.json")
      out.push(`${app.name}: tauri.conf.json version must be "../package.json", found "${app.tauriConf}".`);
    for (const [where, value] of [
      ["package.json", app.packageJson],
      ["Cargo.toml", app.cargoToml],
      ["Cargo.lock", app.cargoLock],
    ]) {
      if (value !== want) out.push(`${app.name}: ${where} has ${value}, expected ${want}.`);
    }
    if (release) {
      if (!app.pubkey) out.push(`${app.name}: the updater public key is missing.`);
      if (!app.endpoints.length) out.push(`${app.name}: the updater has no endpoint.`);
    }
  }
  if (release && found.length === 2 && found[0].pubkey !== found[1].pubkey)
    out.push("Facta and Facta Widgets must use the same updater public key.");
  return out;
}
