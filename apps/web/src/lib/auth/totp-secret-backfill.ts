import {
  decryptTotpSecret,
  encryptTotpSecret,
  resolveTotpSecret,
  type StoredTotpSecret,
  type TotpSecretKeyring,
} from "./totp-secret-encryption";

export type TotpSecretMaintenanceMode = "backfill" | "rotate" | "verify";

export type TotpSecretMaintenanceRecord = StoredTotpSecret & {
  id: string;
};

export type TotpSecretMaintenanceRepository = {
  listCandidates: (input: {
    activeKeyVersion: string;
    afterId: string | null;
    batchSize: number;
    mode: TotpSecretMaintenanceMode;
  }) => Promise<TotpSecretMaintenanceRecord[]>;
  updateEncryptedSecret: (input: {
    ciphertext: string;
    expectedCiphertext: string | null;
    expectedKeyVersion: string | null;
    expectedPlaintext: string | null;
    id: string;
    keyVersion: string;
  }) => Promise<boolean>;
};

export type TotpSecretMaintenanceSummary = {
  ciphertextMissing: number;
  conflicts: number;
  decryptFailures: number;
  failed: number;
  plaintextRemaining: number;
  planned: number;
  scanned: number;
  skipped: number;
  unknownKeyVersions: number;
  updated: number;
  verified: number;
};

function createSummary(): TotpSecretMaintenanceSummary {
  return {
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
  };
}

function assertBatchSize(batchSize: number) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1_000) {
    throw new RangeError("TOTP secret maintenance batch size must be between 1 and 1000.");
  }
}

export function parseTotpSecretMaintenanceArgs(args: string[]): {
  batchSize: number;
  confirmed: boolean;
  dryRun: boolean;
  mode: TotpSecretMaintenanceMode;
} {
  let batchSize: number | null = null;
  let confirmed = false;
  let dryRun = false;
  let mode: TotpSecretMaintenanceMode | null = null;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (argument === "--confirm") {
      if (args[index + 1] !== "write-totp-secrets") {
        throw new TypeError("TOTP secret maintenance confirmation token is invalid.");
      }
      confirmed = true;
      index += 1;
      continue;
    }
    if (argument === "--mode") {
      const value = args[index + 1];
      if (value !== "backfill" && value !== "rotate" && value !== "verify") {
        throw new TypeError("TOTP secret maintenance mode must be backfill, rotate, or verify.");
      }
      mode = value;
      index += 1;
      continue;
    }
    if (argument === "--batch-size") {
      const value = Number(args[index + 1]);
      if (!Number.isInteger(value) || value < 1 || value > 1_000) {
        throw new RangeError("TOTP secret maintenance batch size must be between 1 and 1000.");
      }
      batchSize = value;
      index += 1;
      continue;
    }
    throw new TypeError("TOTP secret maintenance received an unknown argument.");
  }

  if (!mode) {
    throw new TypeError("TOTP secret maintenance mode must be backfill, rotate, or verify.");
  }
  if (batchSize === null) {
    throw new RangeError("TOTP secret maintenance batch size must be between 1 and 1000.");
  }
  if ((mode === "backfill" || mode === "rotate") && !dryRun && !confirmed) {
    throw new TypeError("TOTP secret maintenance write mode requires explicit confirmation.");
  }

  return { batchSize, confirmed, dryRun, mode };
}

export async function runTotpSecretMaintenance(options: {
  batchSize: number;
  dryRun?: boolean;
  keyring: TotpSecretKeyring;
  mode: TotpSecretMaintenanceMode;
  repository: TotpSecretMaintenanceRepository;
}) {
  assertBatchSize(options.batchSize);
  const summary = createSummary();
  let afterId: string | null = null;

  while (true) {
    const records = await options.repository.listCandidates({
      activeKeyVersion: options.keyring.activeKeyVersion,
      afterId,
      batchSize: options.batchSize,
      mode: options.mode,
    });
    if (records.length === 0) {
      break;
    }

    for (const record of records) {
      summary.scanned += 1;
      if (options.mode === "verify") {
        const hasPlaintext = Boolean(record.twoFactorSecret);
        const hasCiphertext = Boolean(record.twoFactorSecretCiphertext);
        if (hasPlaintext) {
          summary.plaintextRemaining += 1;
        }
        if (!hasCiphertext) {
          summary.ciphertextMissing += 1;
          continue;
        }
        if (
          !record.twoFactorSecretKeyVersion ||
          !options.keyring.keys.has(record.twoFactorSecretKeyVersion)
        ) {
          summary.failed += 1;
          summary.unknownKeyVersions += 1;
          continue;
        }
        try {
          decryptTotpSecret({
            ciphertext: record.twoFactorSecretCiphertext ?? "",
            keyVersion: record.twoFactorSecretKeyVersion,
            keyring: options.keyring,
            userId: record.id,
          });
          summary.verified += 1;
        } catch {
          summary.decryptFailures += 1;
          summary.failed += 1;
        }
        continue;
      }
      try {
        const plaintext = resolveTotpSecret(record, record.id, options.keyring);
        if (!plaintext) {
          summary.skipped += 1;
          continue;
        }

        if (
          options.mode === "rotate" &&
          record.twoFactorSecretKeyVersion === options.keyring.activeKeyVersion
        ) {
          summary.skipped += 1;
          continue;
        }

        summary.planned += 1;
        const encrypted = encryptTotpSecret({
          keyring: options.keyring,
          plaintext,
          userId: record.id,
        });
        const verified = decryptTotpSecret({
          ...encrypted,
          keyring: options.keyring,
          userId: record.id,
        });
        if (verified !== plaintext) {
          summary.failed += 1;
          continue;
        }
        summary.verified += 1;

        if (options.dryRun) {
          continue;
        }

        const updated = await options.repository.updateEncryptedSecret({
          ciphertext: encrypted.ciphertext,
          expectedCiphertext: record.twoFactorSecretCiphertext ?? null,
          expectedKeyVersion: record.twoFactorSecretKeyVersion ?? null,
          expectedPlaintext: record.twoFactorSecret ?? null,
          id: record.id,
          keyVersion: encrypted.keyVersion,
        });
        if (updated) {
          summary.updated += 1;
        } else {
          summary.conflicts += 1;
        }
      } catch {
        summary.failed += 1;
      }
    }

    afterId = records.at(-1)?.id ?? afterId;
  }

  return summary;
}
