import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseTotpSecretMaintenanceArgs,
  runTotpSecretMaintenance,
  type TotpSecretMaintenanceMode,
  type TotpSecretMaintenanceRecord,
  type TotpSecretMaintenanceRepository,
} from "./totp-secret-backfill";
import {
  encryptTotpSecret,
  parseTotpSecretKeyring,
  resolveTotpSecret,
} from "./totp-secret-encryption";

const KEY_V1 = Buffer.alloc(32, 0x71).toString("base64url");
const KEY_V2 = Buffer.alloc(32, 0x72).toString("base64url");

function keyring(activeKeyVersion: "v1" | "v2") {
  return parseTotpSecretKeyring({
    TOTP_SECRET_ENCRYPTION_ACTIVE_KEY_VERSION: activeKeyVersion,
    TOTP_SECRET_ENCRYPTION_KEYS: JSON.stringify({ v1: KEY_V1, v2: KEY_V2 }),
  });
}

class MemoryRepository implements TotpSecretMaintenanceRepository {
  readonly pages: Array<string | null> = [];
  readonly rows = new Map<string, TotpSecretMaintenanceRecord>();
  forceConflict = false;

  constructor(records: TotpSecretMaintenanceRecord[]) {
    for (const record of records) {
      this.rows.set(record.id, { ...record });
    }
  }

  async listCandidates(input: {
    activeKeyVersion: string;
    afterId: string | null;
    batchSize: number;
    mode: TotpSecretMaintenanceMode;
  }) {
    this.pages.push(input.afterId);
    return [...this.rows.values()]
      .filter((record) => record.id > (input.afterId ?? ""))
      .filter((record) => {
        if (input.mode === "backfill") {
          return Boolean(record.twoFactorSecret);
        }
        if (input.mode === "rotate") {
          return (
            Boolean(record.twoFactorSecretCiphertext) &&
            record.twoFactorSecretKeyVersion !== input.activeKeyVersion
          );
        }
        return Boolean(record.twoFactorSecret) || Boolean(record.twoFactorSecretCiphertext);
      })
      .sort((left, right) => left.id.localeCompare(right.id))
      .slice(0, input.batchSize)
      .map((record) => ({ ...record }));
  }

  async updateEncryptedSecret(input: {
    ciphertext: string;
    expectedCiphertext: string | null;
    expectedKeyVersion: string | null;
    expectedPlaintext: string | null;
    id: string;
    keyVersion: string;
  }) {
    if (this.forceConflict) {
      return false;
    }
    const record = this.rows.get(input.id);
    if (
      !record ||
      record.twoFactorSecret !== input.expectedPlaintext ||
      record.twoFactorSecretCiphertext !== input.expectedCiphertext ||
      record.twoFactorSecretKeyVersion !== input.expectedKeyVersion
    ) {
      return false;
    }
    record.twoFactorSecret = null;
    record.twoFactorSecretCiphertext = input.ciphertext;
    record.twoFactorSecretKeyVersion = input.keyVersion;
    return true;
  }
}

function legacyRecord(id: string): TotpSecretMaintenanceRecord {
  return {
    id,
    twoFactorSecret: `SECRET${id}`,
    twoFactorSecretCiphertext: null,
    twoFactorSecretKeyVersion: null,
  };
}

describe("TOTP secret maintenance", () => {
  it("reports transition and ciphertext health separately in verify mode", async () => {
    const valid = encryptTotpSecret({
      keyring: keyring("v1"),
      plaintext: "VALID",
      userId: "valid",
    });
    const unknownVersion = encryptTotpSecret({
      keyring: keyring("v1"),
      plaintext: "UNKNOWN",
      userId: "unknown",
    });
    const repository = new MemoryRepository([
      legacyRecord("plaintext-only"),
      {
        id: "valid",
        twoFactorSecret: null,
        twoFactorSecretCiphertext: valid.ciphertext,
        twoFactorSecretKeyVersion: valid.keyVersion,
      },
      {
        id: "corrupt",
        twoFactorSecret: "LEGACY",
        twoFactorSecretCiphertext: '{"v":1,"ciphertext":"bad","nonce":"bad","tag":"bad"}',
        twoFactorSecretKeyVersion: "v1",
      },
      {
        id: "unknown",
        twoFactorSecret: null,
        twoFactorSecretCiphertext: unknownVersion.ciphertext,
        twoFactorSecretKeyVersion: "v9",
      },
    ]);

    const summary = await runTotpSecretMaintenance({
      batchSize: 10,
      keyring: keyring("v1"),
      mode: "verify",
      repository,
    });

    assert.equal(summary.plaintextRemaining, 2);
    assert.equal(summary.ciphertextMissing, 1);
    assert.equal(summary.decryptFailures, 1);
    assert.equal(summary.unknownKeyVersions, 1);
    assert.equal(summary.verified, 1);
  });

  it("clears plaintext only after a verified conditional backfill update", async () => {
    const repository = new MemoryRepository([legacyRecord("user-1")]);

    const summary = await runTotpSecretMaintenance({
      batchSize: 10,
      keyring: keyring("v1"),
      mode: "backfill",
      repository,
    });

    const record = repository.rows.get("user-1");
    assert.equal(summary.updated, 1);
    assert.equal(record?.twoFactorSecret, null);
    assert.equal(resolveTotpSecret(record!, "user-1", keyring("v1")), "SECRETuser-1");
  });

  it("clears historical dual-written plaintext after verifying its ciphertext", async () => {
    const encrypted = encryptTotpSecret({
      keyring: keyring("v1"),
      plaintext: "CIPHERTEXT_SOURCE",
      userId: "user-1",
    });
    const repository = new MemoryRepository([
      {
        id: "user-1",
        twoFactorSecret: "CIPHERTEXT_SOURCE",
        twoFactorSecretCiphertext: encrypted.ciphertext,
        twoFactorSecretKeyVersion: encrypted.keyVersion,
      },
    ]);

    const summary = await runTotpSecretMaintenance({
      batchSize: 10,
      keyring: keyring("v1"),
      mode: "backfill",
      repository,
    });

    const record = repository.rows.get("user-1");
    assert.equal(summary.updated, 1);
    assert.equal(record?.twoFactorSecret, null);
    assert.equal(resolveTotpSecret(record!, "user-1", keyring("v1")), "CIPHERTEXT_SOURCE");
  });

  it("parses bounded explicit CLI arguments and rejects unsafe input", () => {
    assert.deepEqual(
      parseTotpSecretMaintenanceArgs(["--mode", "backfill", "--batch-size", "100", "--dry-run"]),
      {
        batchSize: 100,
        confirmed: false,
        dryRun: true,
        mode: "backfill",
      },
    );
    assert.deepEqual(
      parseTotpSecretMaintenanceArgs([
        "--mode",
        "rotate",
        "--batch-size",
        "25",
        "--confirm",
        "write-totp-secrets",
      ]),
      {
        batchSize: 25,
        confirmed: true,
        dryRun: false,
        mode: "rotate",
      },
    );
    assert.throws(
      () => parseTotpSecretMaintenanceArgs(["--mode", "backfill", "--batch-size", "100"]),
      /write mode requires explicit confirmation/u,
    );
    assert.throws(
      () => parseTotpSecretMaintenanceArgs(["--mode", "erase", "--batch-size", "100"]),
      /mode must be backfill, rotate, or verify/u,
    );
    assert.throws(
      () => parseTotpSecretMaintenanceArgs(["--mode", "verify", "--batch-size", "0"]),
      /batch size must be between 1 and 1000/u,
    );
    assert.throws(
      () => parseTotpSecretMaintenanceArgs(["--mode", "verify", "--batch-size", "10", "--force"]),
      /unknown argument/u,
    );
  });

  it("backfills in cursor batches and becomes a no-op on repeat", async () => {
    const repository = new MemoryRepository([
      legacyRecord("user-1"),
      legacyRecord("user-2"),
      legacyRecord("user-3"),
    ]);

    const first = await runTotpSecretMaintenance({
      batchSize: 2,
      keyring: keyring("v1"),
      mode: "backfill",
      repository,
    });

    assert.deepEqual(first, {
      ciphertextMissing: 0,
      conflicts: 0,
      decryptFailures: 0,
      failed: 0,
      plaintextRemaining: 0,
      planned: 3,
      scanned: 3,
      skipped: 0,
      unknownKeyVersions: 0,
      updated: 3,
      verified: 3,
    });
    assert.deepEqual(repository.pages, [null, "user-2", "user-3"]);
    for (const record of repository.rows.values()) {
      assert.equal(typeof record.twoFactorSecretCiphertext, "string");
      assert.equal(record.twoFactorSecretKeyVersion, "v1");
      assert.equal(resolveTotpSecret(record, record.id, keyring("v1")), `SECRET${record.id}`);
    }

    repository.pages.length = 0;
    const second = await runTotpSecretMaintenance({
      batchSize: 2,
      keyring: keyring("v1"),
      mode: "backfill",
      repository,
    });
    assert.deepEqual(second, {
      ciphertextMissing: 0,
      conflicts: 0,
      decryptFailures: 0,
      failed: 0,
      plaintextRemaining: 0,
      planned: 0,
      scanned: 0,
      skipped: 0,
      unknownKeyVersions: 0,
      updated: 0,
      verified: 0,
    });
    assert.deepEqual(repository.pages, [null]);
  });

  it("dry-run verifies candidates without writing", async () => {
    const repository = new MemoryRepository([legacyRecord("user-1")]);

    const summary = await runTotpSecretMaintenance({
      batchSize: 100,
      dryRun: true,
      keyring: keyring("v1"),
      mode: "backfill",
      repository,
    });

    assert.equal(summary.planned, 1);
    assert.equal(summary.verified, 1);
    assert.equal(summary.updated, 0);
    assert.equal(repository.rows.get("user-1")?.twoFactorSecretCiphertext, null);
  });

  it("rotates old ciphertext and verify mode performs no writes", async () => {
    const plaintext = "ROTATESECRET";
    const oldEncrypted = encryptTotpSecret({
      keyring: keyring("v1"),
      plaintext,
      userId: "user-1",
    });
    const repository = new MemoryRepository([
      {
        id: "user-1",
        twoFactorSecret: plaintext,
        twoFactorSecretCiphertext: oldEncrypted.ciphertext,
        twoFactorSecretKeyVersion: oldEncrypted.keyVersion,
      },
    ]);

    const rotated = await runTotpSecretMaintenance({
      batchSize: 10,
      keyring: keyring("v2"),
      mode: "rotate",
      repository,
    });
    assert.equal(rotated.updated, 1);
    assert.equal(repository.rows.get("user-1")?.twoFactorSecretKeyVersion, "v2");
    assert.equal(
      resolveTotpSecret(repository.rows.get("user-1")!, "user-1", keyring("v2")),
      plaintext,
    );

    const verified = await runTotpSecretMaintenance({
      batchSize: 10,
      keyring: keyring("v2"),
      mode: "verify",
      repository,
    });
    assert.equal(verified.verified, 1);
    assert.equal(verified.updated, 0);
  });

  it("reports conditional update conflicts without overwriting", async () => {
    const repository = new MemoryRepository([legacyRecord("user-1")]);
    repository.forceConflict = true;

    const summary = await runTotpSecretMaintenance({
      batchSize: 10,
      keyring: keyring("v1"),
      mode: "backfill",
      repository,
    });

    assert.equal(summary.conflicts, 1);
    assert.equal(summary.updated, 0);
    assert.equal(repository.rows.get("user-1")?.twoFactorSecretCiphertext, null);
  });

  it("counts corrupt ciphertext without exposing it", async () => {
    const repository = new MemoryRepository([
      {
        id: "user-1",
        twoFactorSecret: "PLAINTEXT",
        twoFactorSecretCiphertext: '{"v":1,"ciphertext":"bad","nonce":"bad","tag":"bad"}',
        twoFactorSecretKeyVersion: "v1",
      },
    ]);

    const summary = await runTotpSecretMaintenance({
      batchSize: 10,
      keyring: keyring("v1"),
      mode: "verify",
      repository,
    });

    assert.equal(summary.failed, 1);
    assert.equal(summary.verified, 0);
    assert.doesNotMatch(JSON.stringify(summary), /PLAINTEXT|"nonce":"bad"|"tag":"bad"/u);
  });
});
