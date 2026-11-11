#!/usr/bin/env node
// Sets one version for Facta and Facta Widgets:
//   node scripts/bump-version.mjs 1.0.1
// Updates both package.json, both Cargo.toml and both Cargo.lock, then runs
// the same check as CI. Commit "Release 1.0.1", tag v1.0.1, push the tag.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  apps,
  collect,
  problems,
  read,
  root,
  SEMVER,
  setCargoLockVersion,
  setCargoTomlVersion,
  setPackageVersion,
} from "./versions.mjs";

const version = process.argv[2]?.replace(/^v/, "");
if (!version || !SEMVER.test(version)) {
  console.error("Usage: node scripts/bump-version.mjs X.Y.Z");
  process.exit(1);
}

const write = (path, text) => writeFileSync(join(root, path), text);
for (const app of apps) {
  write(`${app.dir}/package.json`, setPackageVersion(read(`${app.dir}/package.json`), version));
  write(`${app.dir}/src-tauri/Cargo.toml`, setCargoTomlVersion(read(`${app.dir}/src-tauri/Cargo.toml`), version));
  const lock = `${app.dir}/src-tauri/Cargo.lock`;
  write(lock, setCargoLockVersion(read(lock), app.crate, version));
}

const issues = problems(collect(), { tag: `v${version}` });
if (issues.length) {
  for (const issue of issues) console.error(issue);
  process.exit(1);
}
console.log(`Both apps are now ${version}.`);
