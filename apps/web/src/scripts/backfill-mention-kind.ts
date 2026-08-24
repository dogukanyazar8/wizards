import { prisma } from "@wizards/db";

/**
 * Bahsedilmeler Ş2 — `MessageMention.kind` / `DMMessageMention.kind` doğrulama betiği.
 *
 * **Yıkıcı iş yok, bilerek.** Dalga 0 kolonu `SELF` varsayılanıyla ekledi ve mevcut satırların
 * hepsi kullanıcı adı eşleşmesinden doğdu; yani geçmiş zaten doğru anlatılıyor. Geriye kalan tek
 * soru "gerçekten öyle mi?" ve bu betik onu **sayarak** cevaplıyor. `--apply` yalnız `SELF`
 * olması gereken ama `roleId`si olmayan `ROLE` satırlarını düzeltir; böyle bir satır bugün
 * yoktur, kod yolu onu üretemez, ve varsa bir hatanın izidir.
 *
 * Varsayılan `--dry-run`. Tekrar tekrar koşturulabilir: hiçbir adım okuduğu şeyi ikinci kez
 * değiştirmez.
 *
 *   pnpm --filter @wizards/web exec tsx src/scripts/backfill-mention-kind.ts
 *   pnpm --filter @wizards/web exec tsx src/scripts/backfill-mention-kind.ts --apply
 */

export type MentionKindAudit = {
  channelByKind: Record<string, number>;
  /** `kind = ROLE` ama `roleId` boş: tutarsız satır. */
  channelRoleWithoutRoleId: number;
  dmByKind: Record<string, number>;
  /** DM'de rol ve `@herkes` yoktur; `SELF` dışında bir satır tutarsızdır. */
  dmNonSelf: number;
};

type MentionKindAuditClient = {
  dMMessageMention: {
    groupBy(args: unknown): Promise<Array<{ _count: { _all: number }; kind: string }>>;
  };
  messageMention: {
    count(args: unknown): Promise<number>;
    groupBy(args: unknown): Promise<Array<{ _count: { _all: number }; kind: string }>>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
};

function toCountByKind(rows: Array<{ _count: { _all: number }; kind: string }>) {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.kind] = row._count._all;
  }

  return counts;
}

export async function auditMentionKinds(client: MentionKindAuditClient): Promise<MentionKindAudit> {
  const [channelRows, dmRows, channelRoleWithoutRoleId] = await Promise.all([
    client.messageMention.groupBy({ by: ["kind"], _count: { _all: true } }),
    client.dMMessageMention.groupBy({ by: ["kind"], _count: { _all: true } }),
    client.messageMention.count({ where: { kind: "ROLE", roleId: null } }),
  ]);
  const dmByKind = toCountByKind(dmRows);

  return {
    channelByKind: toCountByKind(channelRows),
    channelRoleWithoutRoleId,
    dmByKind,
    dmNonSelf: Object.entries(dmByKind).reduce(
      (total, [kind, count]) => (kind === "SELF" ? total : total + count),
      0,
    ),
  };
}

/** Tutarsız `ROLE` satırlarını `SELF`e döndürür. `roleId`si olan satıra dokunmaz. */
export async function repairRoleMentionsWithoutRole(client: MentionKindAuditClient) {
  const result = await client.messageMention.updateMany({
    where: { kind: "ROLE", roleId: null },
    data: { kind: "SELF" },
  });

  return result.count;
}

export function formatMentionKindAudit(audit: MentionKindAudit): string[] {
  return [
    `MessageMention   : ${JSON.stringify(audit.channelByKind)}`,
    `DMMessageMention : ${JSON.stringify(audit.dmByKind)}`,
    `ROLE without roleId : ${audit.channelRoleWithoutRoleId}`,
    `DM rows that are not SELF : ${audit.dmNonSelf}`,
  ];
}

async function main() {
  const apply = process.argv.includes("--apply");
  const audit = await auditMentionKinds(prisma as unknown as MentionKindAuditClient);

  for (const line of formatMentionKindAudit(audit)) {
    console.info(`[backfill-mention-kind] ${line}`);
  }

  if (!apply) {
    console.info("[backfill-mention-kind] dry run — nothing written. Pass --apply to repair.");
    return;
  }

  const repaired = await repairRoleMentionsWithoutRole(prisma as unknown as MentionKindAuditClient);
  console.info(`[backfill-mention-kind] repaired ${repaired} row(s) back to SELF.`);
}

if (process.argv[1]?.includes("backfill-mention-kind")) {
  main()
    .catch((error) => {
      console.error("[backfill-mention-kind] failed", error);
      process.exitCode = 1;
    })
    .finally(() => {
      void prisma.$disconnect();
    });
}
