# Whispr "Mesajlar" §15–§17 — profil paneli, üye ekle, başlık menüleri

Bu paket `design_handoff/mesajlar-paketi/` (2026-08-27 turu) ile ürün arasındaki **farkı** kapatır.

`design_handoff/app_new/mesajlar-paketi/` (2026-08-20 turu) SPEC §1–§14'ü tarif ediyordu ve
`docs/prompts/whispr-mesajlar/` paketiyle **uygulandı**: sohbet rayı 276, Arkadaşlar 4 sekme,
DM/grup sohbeti, bestekar, canlı anket, thread ve arama panelleri, grup + anket modalları, boş
durum. Yeni tur bunlara dokunmuyor; **10 yeni ekran** ekliyor.

## Delta — iki SPEC'in farkı (doğrulanmış, `diff` ile)

| SPEC bölümü       | Ne geldi                                                                                      | Ürün karşılığı bugün                                       |
| ----------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| §2 durum haritası | `panel: profile`, `ptab`, `modal: invite`, `more`, `role` eksenleri                           | yok                                                        |
| §6 başlık         | sağ panel genişliği ikiye ayrıldı: thread/arama **340**, profil **330**                       | tek genişlik 340                                           |
| §10 etkileşim     | 9 yeni satır (menüler, profil sekmeleri, gizlilik anahtarları, üye ekle, sessize alma)        | yok                                                        |
| §12 state         | `privacy`, `inviteSelection`, `inviteLinkExpiry`, `mutedUntil`, `toast`, `role`               | yok                                                        |
| **§15**           | Profil paneli 330 — kimlik bloğu, DM 3 / grup 4 sekme, Genel · Üyeler · Medya · Ayarlar       | `DmDetailsPanel` + `DmGroupDetailsPanel` (Faz 6, sekmesiz) |
| **§16**           | Üye ekle modalı 560 — aday listesi, zaten-üye yığını, bağlantıyla davet, alt bar              | yok                                                        |
| **§17**           | DM 254 / grup 262 `...` menüleri, `Sessize al` alt menüsü, başlık sessiz pill'i, toast şeridi | `...` butonu var, menü yok                                 |
| `screens/`        | 12 → **22** ekran (13–22 yeni)                                                                | —                                                          |

`SPEC-ANA-SAYFA.md` iki tur arasında **birebir aynı** (`diff` boş) — token, tipografi ve ölçek
adımları değişmedi.

## Dalga grafiği

```
Dalga 0  ─┬─ Ş0.1 ölçü sözlüğü (§15–§17) + SPEC_DEVIATIONS
          ├─ Ş0.2 migration: DMParticipant.mutedUntil + UserSettings.showTypingIndicator
          ├─ Ş0.3 @wizards/types: durum eksenleri + 9 DTO
          └─ Ş0.4 i18n messages.profile/invite/more/toast (tr + en)
                                    ↓ kapı: typecheck + test + db:generate + migrate

Dalga 1  ─┬─ Ş1 DM profil verisi ucu + ortak arkadaşlar + rozet köprüsü
          ├─ Ş2 grup profil verisi ucu + geçmişi temizle / grubu sil
          ├─ Ş3 paylaşılan medya · dosya · bağlantı ucu (web + mobil ortak servis)
          └─ Ş4 gizlilik tercihi + süreli sessize alma + bildir ucu
                                    ↓ kapı: her şerit kendi route-logic testini geçirir

Dalga 2  ─┬─ Ş5 profil paneli kabuğu + kimlik bloğu + sekmeler (eski 3 panel sökülür)
          ├─ Ş6 Genel sekmesi (DM + grup)
          ├─ Ş7 Üyeler + Medya sekmeleri
          └─ Ş8 Ayarlar sekmesi (bildirim · gizlilik · tehlike)
                                    ↓ kapı: her şerit kendi render testini geçirir

Dalga 3  ─┬─ Ş9  başlık menüleri + sessize alma + toast şeridi
          ├─ Ş10 üye ekle modalı
          └─ Ş11 parity kapısı: 22 ekran · 2 tema · 4 çözünürlük · a11y · perf   ← Ş9/Ş10 sonrası
```

Dalga 0 bitmeden hiçbir şerit başlamaz. Dalga 1 ve 2 şeritleri **ayrık dosya kümelerine** sahiptir;
her prompt'un §"Sahiplenilen dosyalar" bölümü bağlayıcıdır — orada yazmayan dosyaya **yazma, oku**.
Dalga 3'te Ş9 ve Ş10 paraleldir, Ş11 ikisinden sonra koşar.

## Dosyalar

| Dosya                                     | Kapsam                                                                                 | Ön koşul               |
| ----------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------- |
| `00-ortak-baglam.md`                      | Kurallar, doğrulanmış 21 gerçek, 16 bağlayıcı karar, 11 tuzak. **Uygulanmaz, okunur.** | —                      |
| `01-dalga0-sozlesme.md`                   | 4 paralel şerit: ölçü, migration, tipler, i18n                                         | —                      |
| `02-dalga1-s1-dm-profil-api.md`           | `GET /dm/:id/profile`, ortak arkadaşlar, rozet köprüsü                                 | Dalga 0                |
| `03-dalga1-s2-grup-profil-api.md`         | `GET /dm/groups/:id/profile`, geçmişi temizle, grubu sil                               | Dalga 0                |
| `04-dalga1-s3-paylasilan-medya-api.md`    | medya · dosya · bağlantı sayfalama, web + mobil ortak servis                           | Dalga 0                |
| `05-dalga1-s4-gizlilik-sessize-bildir.md` | `showTypingIndicator`, süreli mute, `POST /users/:id/report`                           | Dalga 0                |
| `06-dalga2-s5-panel-kabugu.md`            | `ConversationProfilePanel` 330, kimlik bloğu, sekmeler, 3 eski panelin sökülmesi       | Dalga 0                |
| `07-dalga2-s6-genel-sekmesi.md`           | HAKKINDA, rozet ızgarası, tarih kartı, ortak sunucu/arkadaş, sabitlenenler             | Dalga 0                |
| `08-dalga2-s7-uyeler-medya.md`            | Üyeler sekmesi + davet bağlantısı kartı, Medya sekmesi                                 | Dalga 0                |
| `09-dalga2-s8-ayarlar-sekmesi.md`         | Bildirim radyoları, gizlilik kartı, tehlike aksiyonları                                | Dalga 0                |
| `10-dalga3-s9-menuler-toast.md`           | DM 254 / grup 262 menü, sessize al alt menüsü, sessiz pill, toast şeridi               | Dalga 1 Ş4, Dalga 2 Ş5 |
| `11-dalga3-s10-uye-ekle-modali.md`        | `AddMembersModal` 560, üç açılış noktası                                               | Dalga 1 Ş2, Dalga 2 Ş5 |
| `12-dalga3-s11-parity-qa.md`              | 22 ekran parity, a11y, kırılım, perf, kapanış raporu                                   | Ş9 + Ş10               |

Her şerit bitişinde `raporlar/NN-rapor.md` yazar: ne yapıldı, ne sapıldı, ne açık kaldı.

## Kapı komutları

```bash
pnpm --filter @wizards/types test
```

```bash
pnpm --filter @wizards/web typecheck
```

```bash
pnpm --filter @wizards/web test
```

```bash
pnpm --filter @wizards/db exec prisma migrate dev
```

`typecheck` ve `lint` aynı komuttur ve **pnpm üzerinden** koşmak zorundadır (`npm run` altında
`typescript-project-runner.mjs` sürüm karşılaştırmasında ölür, derlemeye hiç başlamaz).
