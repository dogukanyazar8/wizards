import { ServerTagSchema } from "@wizards/types";

/**
 * SPEC-SUNUCU §8.2'nin `ÖNERİLEN ETİKETLER` tablosu: kod rozetli 5 grup × 4 etiket.
 *
 * Aynı liste iki yerde çizilir — sunucu ayarlarındaki `Görünürlük ve Keşfet` bölümü ve sunucu
 * oluşturma penceresinin `KEŞİF ETİKETLERİ` bloğu (PROMPT §3: **tek** bileşen). İki kopya iki
 * ayrı öneri kümesi demek olurdu.
 *
 * `label` kullanıcıya gösterilen metin, `tag` sunucuya yazılan slug'dır. Slug'lar
 * `ServerTagSchema`'nın kuralından (küçük harf, `a-z0-9-`, ≤24) geçer; Türkçe karakterler bu
 * yüzden ASCII karşılığına iner — "Türkçe Sohbet" ile "türkçe-sohbet" iki farklı etiket olmasın
 * diye normalleştirme sözleşmede yaşıyor.
 */
export type DiscoveryTagSuggestion = {
  label: string;
  tag: string;
};

export type DiscoveryTagGroup = {
  /** Rozetteki iki harf; SPEC §8.2 tablosundaki kodun aynısı. */
  code: string;
  id: string;
  suggestions: readonly DiscoveryTagSuggestion[];
};

export const DISCOVERY_TAG_GROUPS: readonly DiscoveryTagGroup[] = [
  {
    code: "OY",
    id: "gaming",
    suggestions: [
      { label: "Oyun", tag: "oyun" },
      { label: "Turnuva", tag: "turnuva" },
      { label: "Takım bulma", tag: "takim-bulma" },
      { label: "Espor", tag: "espor" },
    ],
  },
  {
    code: "İŞ",
    id: "work",
    suggestions: [
      { label: "İş", tag: "is" },
      { label: "Kariyer", tag: "kariyer" },
      { label: "Girişimcilik", tag: "girisimcilik" },
      { label: "Freelance", tag: "freelance" },
    ],
  },
  {
    code: "ÇA",
    id: "study",
    suggestions: [
      { label: "Çalışma", tag: "calisma" },
      { label: "Yazılım", tag: "yazilim" },
      { label: "Yapay zekâ", tag: "yapay-zeka" },
      { label: "Dil öğrenimi", tag: "dil-ogrenimi" },
    ],
  },
  {
    code: "Kİ",
    id: "personal",
    suggestions: [
      { label: "Kişisel", tag: "kisisel" },
      { label: "Müzik", tag: "muzik" },
      { label: "Fitness", tag: "fitness" },
      { label: "Film & kitap", tag: "film-kitap" },
    ],
  },
  {
    code: "DE",
    id: "support",
    suggestions: [
      { label: "Destek", tag: "destek" },
      { label: "Moderasyon", tag: "moderasyon" },
      { label: "Güvenlik", tag: "guvenlik" },
      { label: "Teknik yardım", tag: "teknik-yardim" },
    ],
  },
];

/** Öneri listesinin düz hâli; "bu slug bir öneri mi" sorusunun tek cevabı. */
export const DISCOVERY_TAGS: readonly string[] = DISCOVERY_TAG_GROUPS.flatMap((group) =>
  group.suggestions.map((suggestion) => suggestion.tag),
);

/**
 * Elle yazılan etiketi sözleşmenin kuralından geçirir. Geçersizse `null` döner ve çağıran
 * `Etiket yaz, Enter'a bas` alanında hata gösterir — sunucuya hiç gitmez.
 */
export function normalizeDiscoveryTag(input: string): string | null {
  const parsed = ServerTagSchema.safeParse(input);

  return parsed.success ? parsed.data : null;
}

/** Bir slug'ın hangi grupta önerildiği; `Keşfet` listelemesinin kategorisi buradan okunur. */
export function findDiscoveryTagGroup(tag: string): DiscoveryTagGroup | null {
  return (
    DISCOVERY_TAG_GROUPS.find((group) =>
      group.suggestions.some((suggestion) => suggestion.tag === tag),
    ) ?? null
  );
}
