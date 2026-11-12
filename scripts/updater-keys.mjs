// Key IDs of the updater public key and signatures (docs/updater.md,
// section 2). A minisign public key or .sig, as Tauri stores it, is base64 of
// minisign text; its second line is base64 of a 2-byte algorithm tag, the
// 8-byte key ID, then the key or signature. A release whose signatures carry
// a different key ID than the apps' pubkey would publish updates no app can
// install, so the release stops before publishing (make-update-manifests.mjs).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const CONFIGS = ["apps/desktop/src-tauri/tauri.conf.json", "apps/widgets/src-tauri/tauri.conf.json"];

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

function decodeBase64(text, what) {
  const clean = text.trim();
  if (!clean || clean.length % 4 !== 0 || !BASE64.test(clean)) throw new Error(`${what} is not base64`);
  return Buffer.from(clean, "base64");
}

/**
 * Key ID of a Tauri pubkey or .sig, as minisign prints it (hex, most
 * significant byte first). `kind` is "pubkey" or "signature".
 */
export function keyIdOf(value, kind, what = kind) {
  const lines = decodeBase64(value, what).toString("utf8").split(/\r?\n/);
  if (!lines[0]?.startsWith("untrusted comment:") || !lines[1]) {
    throw new Error(`${what} is not a minisign ${kind}`);
  }
  const bytes = decodeBase64(lines[1], `${what} (key line)`);
  const tag = bytes.subarray(0, 2).toString("latin1");
  // Public keys are always "Ed"; signatures are "Ed" (legacy) or "ED"
  // (prehashed, which Tauri's signer writes).
  const [tags, size] = kind === "pubkey" ? [["Ed"], 42] : [["Ed", "ED"], 74];
  if (!tags.includes(tag) || bytes.length !== size) {
    throw new Error(`${what} is not a minisign ${kind}`);
  }
  return Buffer.from(bytes.subarray(2, 10)).reverse().toString("hex").toUpperCase();
}

/** The one key ID both apps trust; throws if a pubkey is empty, malformed or they differ. */
export function configuredKeyId(base = root) {
  const ids = CONFIGS.map((file) => {
    const pubkey = JSON.parse(readFileSync(join(base, file), "utf8")).plugins?.updater?.pubkey ?? "";
    if (!pubkey) throw new Error(`${file} has no updater pubkey`);
    return keyIdOf(pubkey, "pubkey", `${file} pubkey`);
  });
  if (ids[0] !== ids[1]) throw new Error(`The apps trust different keys: ${ids[0]} and ${ids[1]}`);
  return ids[0];
}

/** Error messages for signatures that are malformed or not from `expected`. */
export function signatureKeyErrors(expected, signatures) {
  const errors = [];
  for (const [name, signature] of signatures) {
    try {
      const id = keyIdOf(signature, "signature", name);
      if (id !== expected) {
        errors.push(`${name} is signed with key ${id}, but the apps trust ${expected}. Check the TAURI_SIGNING_PRIVATE_KEY secret.`);
      }
    } catch (error) {
      errors.push(error.message);
    }
  }
  return errors;
}
