// node --test scripts/updater-keys.test.mjs
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { CONFIGS, configuredKeyId, keyIdOf, signatureKeyErrors } from "./updater-keys.mjs";

// Key IDs are stored little-endian; minisign prints them reversed.
const ID_A = "BA50095A7EBB84F3";
const ID_B = "6E1948E5DDCA697E";
const idBytes = (id) => Buffer.from(id, "hex").reverse();
const b64 = (bytes) => Buffer.from(bytes).toString("base64");

function pubkey(id) {
  const line = b64(Buffer.concat([Buffer.from("Ed"), idBytes(id), Buffer.alloc(32, 7)]));
  return b64(`untrusted comment: minisign public key: ${id}\n${line}\n`);
}

function signature(id, tag = "ED") {
  const line = b64(Buffer.concat([Buffer.from(tag), idBytes(id), Buffer.alloc(64, 9)]));
  return b64(`untrusted comment: signature from tauri secret key\n${line}\ntrusted comment: timestamp:1\tfile:x\n${b64(Buffer.alloc(64))}\n`);
}

test("reads key IDs from a pubkey and from signatures", () => {
  assert.equal(keyIdOf(pubkey(ID_A), "pubkey"), ID_A);
  assert.equal(keyIdOf(signature(ID_A), "signature"), ID_A);
  assert.equal(keyIdOf(signature(ID_A, "Ed"), "signature"), ID_A);
});

test("matching signatures pass", () => {
  assert.deepEqual(signatureKeyErrors(ID_A, [["a.sig", signature(ID_A)], ["b.sig", signature(ID_A, "Ed")]]), []);
});

test("a signature from another key fails with both IDs", () => {
  const errors = signatureKeyErrors(ID_A, [["ok.sig", signature(ID_A)], ["bad.sig", signature(ID_B)]]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /bad\.sig is signed with key 6E1948E5DDCA697E, but the apps trust BA50095A7EBB84F3/);
});

test("malformed signatures fail", () => {
  const notMinisign = b64("hello\nworld\n");
  const shortLine = b64(`untrusted comment: x\n${b64("ED1234")}\n`);
  const wrongTag = signature(ID_A, "XX");
  const pubkeyAsSig = pubkey(ID_A);
  for (const bad of ["", "not base64!", notMinisign, shortLine, wrongTag, pubkeyAsSig]) {
    const errors = signatureKeyErrors(ID_A, [["bad.sig", bad]]);
    assert.equal(errors.length, 1, `expected an error for ${JSON.stringify(bad)}`);
    assert.match(errors[0], /bad\.sig/);
  }
});

test("a malformed pubkey is rejected", () => {
  assert.throws(() => keyIdOf(signature(ID_A), "pubkey"), /not a minisign pubkey/);
  assert.throws(() => keyIdOf("", "pubkey"), /not base64/);
});

function withConfigs(keys, run) {
  const base = mkdtempSync(join(tmpdir(), "updater-keys-"));
  try {
    CONFIGS.forEach((file, i) => {
      mkdirSync(join(base, dirname(file)), { recursive: true });
      writeFileSync(join(base, file), JSON.stringify({ plugins: { updater: { pubkey: keys[i] } } }));
    });
    return run(base);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

test("both apps must trust the same, non-empty key", () => {
  assert.equal(withConfigs([pubkey(ID_A), pubkey(ID_A)], configuredKeyId), ID_A);
  assert.throws(() => withConfigs([pubkey(ID_A), pubkey(ID_B)], configuredKeyId), /different keys/);
  assert.throws(() => withConfigs([pubkey(ID_A), ""], configuredKeyId), /no updater pubkey/);
});

test("the repository's apps trust one key", () => {
  assert.match(configuredKeyId(), /^[0-9A-F]{16}$/);
});
