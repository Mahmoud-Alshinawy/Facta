#!/usr/bin/env node
// Checks that Facta and Facta Widgets carry one version everywhere.
//   node scripts/check-versions.mjs              (CI)
//   node scripts/check-versions.mjs v1.0.1 --release   (release.yml)
// With a tag, every version must equal it; --release also requires the
// updater public key and endpoint to be set.
import { collect, problems } from "./versions.mjs";

const args = process.argv.slice(2);
const release = args.includes("--release");
const tag = args.find((arg) => !arg.startsWith("--"));

const found = collect();
const issues = problems(found, { tag, release });
for (const app of found)
  console.log(`${app.name}: package.json ${app.packageJson}, Cargo.toml ${app.cargoToml}, Cargo.lock ${app.cargoLock}`);
if (issues.length) {
  for (const issue of issues) console.error(`::error::${issue}`);
  process.exit(1);
}
console.log(tag ? `All versions match ${tag}.` : "All versions match.");
