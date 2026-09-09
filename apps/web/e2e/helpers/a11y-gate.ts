import type AxeBuilder from "@axe-core/playwright";

type AxeResults = Awaited<ReturnType<AxeBuilder["analyze"]>>;
export type AxeViolation = AxeResults["violations"][number];

/**
 * WCAG AAA kapsam dışı: birkaç AAA ölçütü gerçek zamanlı sohbet/ses arayüzü kalıplarıyla
 * çelişiyor. Tarama A + AA.
 */
export const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/** Bir ihlalin koşuyu durdurması için gereken etki seviyesi. */
export const BLOCKING_IMPACTS = new Set(["critical", "serious"]);

/**
 * **Bilinen sapma listesi** — 2026-08-26 kararı.
 *
 * Burada duran kural hâlâ **taranır ve raporlanır**, ama koşuyu durdurmaz. Liste bir muafiyet
 * değil, açık bir borç kaydıdır: her koşuda ihlallerin tamamı hedefleriyle birlikte konsola
 * yazılır, yani sapma hiçbir zaman görünmez hâle gelmez.
 *
 * `color-contrast`: tonlu yüzeylerin tamamı bu kuralın altında kalıyor — sunucu kısaltma
 * rozetleri (`text-[hsl(var(--warning))]` üstünde `bg-[hsl(var(--warning)/0.1)]`),
 * `bg-[hsl(var(--primary)/0.13)]` çipleri, `border-[hsl(var(--primary)/0.45)]` çerçeveleri,
 * üye satırı adları ve `.h-8.w-8.text-white` ikonu. Hepsi tasarımın **kendi** ton çiftleri;
 * düzeltmek palet kararıdır, kod kararı değil. Karar verilene kadar diğer bütün kritik/ciddi
 * kurallar engelleyici kalır — liste tek kurala kilitli.
 *
 * Listeye yeni bir kural eklemek, o kuralı ürün genelinde susturmaktır: gerekçesi buraya
 * yazılmadan eklenmemeli.
 */
export const KNOWN_A11Y_DEVIATION_RULES: ReadonlySet<string> = new Set(["color-contrast"]);

export function formatViolation(violation: AxeViolation): string {
  const targets = violation.nodes.map((node) => node.target.join(" ")).join(", ");

  return `[${violation.impact ?? "unknown"}] ${violation.id}: ${violation.help} (${targets})`;
}

export type AxePartition = {
  /** Koşuyu durduranlar. */
  readonly blocking: readonly AxeViolation[];
  /** Bilinen sapma listesindekiler — raporlanır, durdurmaz. */
  readonly knownDeviations: readonly AxeViolation[];
  /** Etkisi kritik/ciddi olmayanlar. */
  readonly informational: readonly AxeViolation[];
};

export function partitionAxeViolations(violations: readonly AxeViolation[]): AxePartition {
  const blocking: AxeViolation[] = [];
  const knownDeviations: AxeViolation[] = [];
  const informational: AxeViolation[] = [];

  for (const violation of violations) {
    if (!violation.impact || !BLOCKING_IMPACTS.has(violation.impact)) {
      informational.push(violation);
      continue;
    }

    if (KNOWN_A11Y_DEVIATION_RULES.has(violation.id)) {
      knownDeviations.push(violation);
      continue;
    }

    blocking.push(violation);
  }

  return { blocking, informational, knownDeviations };
}

/** Engellemeyen her ihlali hedefleriyle birlikte yazar; borç her koşuda görünür kalır. */
export function reportNonBlockingViolations(partition: AxePartition, label: string): void {
  for (const violation of partition.knownDeviations) {
    // eslint-disable-next-line no-console
    console.log(`a11y (bilinen sapma) ${label}: ${formatViolation(violation)}`);
  }

  for (const violation of partition.informational) {
    // eslint-disable-next-line no-console
    console.log(`a11y (engellemeyen) ${label}: ${formatViolation(violation)}`);
  }
}
