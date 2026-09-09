# Ş5 — Sağ panel 326: üyeler, ses katılımcıları, arama

> Dal: `uat` · Kaynak: `design_handoff/design_handoff_sunucu/` (SPEC §4, `Sunucu.dc.html` 540–700 ve
> 2087–2178) · Şerit dosyası: `docs/prompts/whispr-sunucu/06-dalga2-s5-sag-panel.md`

---

## 1. Ne yapıldı

### Yeni dosyalar

| Dosya                                                        | Satır | İş                                                                  |
| ------------------------------------------------------------ | ----- | ------------------------------------------------------------------- |
| `apps/web/src/lib/servers/member-panel-model.ts`             | 342   | §4.1/§4.2 gruplama, rol rozeti, alt satır, davet durumu — saf model |
| `apps/web/src/lib/servers/member-panel-model.test.ts`        | 372   | 15 test                                                             |
| `apps/web/src/lib/servers/right-panel-store.ts`              | 70    | SPEC §10'un `panel` alanı; modül düzeyinde `useSyncExternalStore`   |
| `apps/web/src/lib/messages/search-filters.ts`                | 208   | §4.3 alan seti ↔ uç parametreleri köprüsü + vurgulama               |
| `apps/web/src/lib/messages/search-filters.test.ts`           | 154   | 12 test                                                             |
| `apps/web/src/lib/messages/jump-to-message.ts`               | 36    | `chat-area`'nın yerel atlaması paylaşılan hâle geldi                |
| `apps/web/src/components/shell/server-member-panel.test.tsx` | 258   | 16 test (yetki negatifi dâhil)                                      |

### Ağır düzenlenen

| Dosya                                                   | Değişim                                                                                                                                       |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/components/shell/server-member-panel.tsx` | 1065 → 761. Tamamen SPEC §4'e göre yeniden yazıldı; `ServerMemberPanelView` (saf) + `ServerMemberPanel` (kancalar) ayrımı                     |
| `apps/web/src/components/chat/message-search-panel.tsx` | 445 → 1079. Ortak `useMessageSearchResults` kancası + **yeni** `ChannelSearchPanel` (§4.3). DM açılır penceresi **davranış olarak değişmedi** |
| `apps/web/src/components/chat/chat-area.tsx`            | +53 / −19. Arama düğmesi sağ panele, `Üyeler` düğmesi panel açma/kapamaya bağlandı; `jumpToMessage` paylaşılan yardımcıya indi                |
| `apps/web/src/lib/servers/metrics.ts`                   | +8 alan (ikon boyutları + `rightPanelOverlayZIndex`)                                                                                          |
| `apps/web/src/lib/locale/messages/{tr,en}.ts`           | +43 anahtar (`server.panel.*`, `server.search.*`), iki dilde eşit                                                                             |
| `apps/web/e2e/specs/design/server-parity.spec.ts`       | Ş5 satırı açıldı: 8 parity testi + 2 davranış testi                                                                                           |
| `apps/web/src/components/shell/wizards-shell.tsx`       | 1 sınıf: içerik satırı `relative` (kırılım katmanının konumlanma bağlamı)                                                                     |

### Panel kabuğu (§4)

- 326 kolon (`layout.rightPanelWidth`), `surface-panel`, sol kenar `border/.5`.
- Başlık `15/15/13`, alt kenar `border/.45`, `600 14px Outfit`, kapatma `27 r9` + `aria-label`.
- Üç içerik **tek kabuğu** paylaşır: `data-panel-content` = `members | voice | search`.
- `<1400px`'te panel akıştan çıkar (`data-panel-overlay="true"`, `z-index 20`).

### Üye listesi (§4.1)

- İki grup: `ÇEVRİMİÇİ` / `ÇEVRİMDIŞI`, 6px nokta + `600 9.5px Outfit .14em`, sağda sayı.
- Üye arama kutusu `8/11` `r12`; istemci süzmesi görünen ad **ve** kullanıcı adı üstünde,
  `toLocaleLowerCase(locale)` ile (Türkçe İ/ı testli).
- Satır `7/8` `r12`, avatar 32 + presence noktası 10, ad `600 13`, rol rozeti, alt satır `500 11`.
- Çevrimdışı satır `opacity .55`.
- Rol rozeti rengi `Role.color` → `role-color.ts` köprüsü; `getRoleColorStyle` yerine
  `getRoleToneColor` (token, hex değil — bkz. sapma S2).

### Ses kanalı katılımcıları (§4.2)

- Başlık `Ses kanalı` + `N KATILDI` success çipi.
- İki grup: `BU KANALDA` / `KANALDA DEĞİL`.
- `Davet et` → `Gönderildi` **tek yönlü**; `markVoiceInviteSent` ikinci çağrıda aynı kümeyi
  döndürür, düğme `aria-disabled` olur. Gönderim mevcut soket ucuna gider
  (`voice:invite:send`, `voice-channel-view.tsx`'in kullandığı aynı olay).
- Çevrimdışı satıra davet düğmesi çizilmez (davet soketle gider, çevrimdışı hedef görmez).
- Ayakta `Davet bağlantısı kopyala` (h38, `primary/.14`, `1px primary/.4`) —
  `${origin}/invite/${server.inviteCode}` panoya yazılır + mevcut toast.

### Arama paneli (§4.3)

- Segment `Basit` / `Gelişmiş` (seçili `primary/.16`), sorgu kutusu `1px primary/.45`.
- Gelişmiş alanlar `8/11` `r11` + chevron: `KİMDEN` · `KANAL` · `TARİH ARALIĞI` (üçü de gerçek
  `<select>`, ok tuşu ve ekran okuyucu bedava).
- `İÇERİYOR` çipleri `Dosya · Bağlantı · Görsel · Sabitlenmiş`, çoklu seçim, `aria-pressed`.
- `Yalnızca thread yanıtlarında ara` anahtarı 38×21 knob 15 — Ş8'in `ServerToggleSwitch`
  `compact` boyu (`role="switch"` + `aria-checked`).
- `Aramayı çalıştır` tam genişlik primary.
- Sonuç başlığı `N SONUÇ` / `N SONUÇ · FİLTRELİ`, sağda `En yeni`.
- Sonuç kartı `11/12` `r14`, hover `primary/.5` + `translateY(-1px)`; avatar 22 + ad + saat,
  eşleşen kelime `warning/.25` zeminle, altta kanal çipi.

---

## 2. SPEC'ten sapmalar

**S1 — Panel kapatma, "ikon modu"nun yerine geçti.**
Bugünkü panel `memberPanelCollapsed` ile 88px'lik bir ikon rayına düşüyordu. SPEC §4'te böyle bir
durum yok: panel ya 326'dır ya da yoktur. Bayrak artık "gizli" demek — ki zaten kendi ayar
metninin dediği şey bu (`settings.row.y5` = "Üye panelini varsayılan olarak göster").
İkon rayı ve panelin sağ tık menüsü (daralt/genişlet + grup sayıları özeti) silindi.

**S2 — Rol rozeti rengi tamsayıdan değil tokendan boyanıyor.**
Eski `getRoleColorStyle` `Role.color`'ı doğrudan `#rrggbb` olarak basıyordu; 00 §2.7 "renk yalnız
`hsl(var(--token))`" diyor. Ş12'nin `role-color.ts` köprüsü tamsayıyı en yakın tona çevirir, rozet
o tokenla boyanır. Kayıtlı renk değişmez, yalnız çizim tokenlaşır.

**S3 — `panel` alanında dördüncü değer yok.**
Şerit dosyası `panel: "members" | "voice" | "search" | null` diyor; SPEC §10 ise
`members | search | null`. Store SPEC'i uygular, `voice` kanal türünden türetilir
(`Sunucu.dc.html` 2137 de aynısını yapıyor: `panel` değişmiyor, `view` değişiyor). Dördüncü bir
değer, kullanıcı ses kanalına geçtiğinde birinin onu güncellemeyi unutabileceği bir durum yaratırdı.

**S4 — `Davet bağlantısı kopyala` yetki kapılı.**
SPEC düğmeyi koşulsuz çiziyor. Üründe `Server.allowMemberAdds` tam da bu kararı taşıyor: kapalıyken
davet yalnız yöneticinin işi. Kapı `isAdmin || allowMemberAdds`; yetkisiz üyeye düğme
**hiç render edilmez** (00 §5). Negatif test: `server-member-panel.test.tsx` →
"yetkisiz üyeye DOM'da hiç görünmez".

**S5 — `Davet bağlantısı kopyala` panoya kopyalar, pencere açmaz.**
`Sunucu.dc.html` bu düğmeyi `modal: 'invite'`e bağlıyor; şerit dosyası "panoya kopyalar + mevcut
toast" diyor ve kabul kriteri de bu. Şerit dosyası uygulandı.

**S6 — Kamera durumu ikonu çizilmiyor.**
SPEC "kamera/ekran = primary" diyor. `VoiceChannelStateDTO` yalnız `isDeafened` ve
`isScreenSharing` taşıyor; kamera durumu sunucu tarafında hiç yok (bkz. TODO(api) T3).
Ekran paylaşımı ve mikrofon ikonları gerçek veriden çiziliyor.

**S7 — Sonuç kartındaki `Dosya ekli` / `Sabitlenmiş` etiket çipi yok.**
`MessageSearchResult` ek/sabitlenme alanı taşımıyor (TODO(api) T1). Kanal çipi (`#kanal`) gerçek
veriden çiziliyor; olmayan bir etiketi çizmek yerine hiç çizilmedi.

**S8 — `En yeni` bir sıralama kontrolü değil, etiket.**
Uç `ORDER BY createdAt DESC, id DESC` ile sabit; ikinci bir sıralama yok. Tıklanabilir bir kontrol
çizmek çalışmayan bir düğme olurdu.

**S9 — `exact` (tam ifade) kontrolü SPEC'in alan setinde yok ama korundu.**
Uç `exact` parametresini destekliyor ve bugünkü DM aramasında kullanılıyor. §4.3 panelinde
gelişmiş alanların arasında duruyor; kaldırmak sessiz bir yetenek kaybı olurdu.

**S10 — DM'in arama açılır penceresi değişmedi.**
§4.3 sunucu ekranının paneli. DM yüzeyi Mesajlar paketinin işi; `MessageSearchPanel` görsel ve
davranış olarak aynı kaldı, yalnız getirme katmanı ortak kancaya taşındı.

**S11 — Panelden dört kart kaldırıldı; yeteneklerin karşılığı:**

| Kaldırılan                                          | Bugün nerede                                                    |
| --------------------------------------------------- | --------------------------------------------------------------- |
| `ServerInfoCard` (ad, açıklama, üye sayısı)         | Kanal kenar çubuğu başlığı (Ş4) + Sunucu ayarları › Genel (Ş11) |
| `ActiveVoiceCard` (aktif ses kanalları + avatarlar) | Kenar çubuğunun ses kanalı satırları + bağlı ses şeridi (Ş4)    |
| `QuickAccessCard` (ayarlar · kanal oluştur · davet) | Sunucu menüsünün beş satırı (Ş4)                                |
| `DesktopDownloadCard`                               | Ayarlar › Hakkında (`about.download.*`)                         |

Kaybolan yetenek yok; dördü de SPEC §4'te yer almıyor.

---

## 3. TODO(api)

**T1 — `İÇERİYOR` çipleri (Dosya · Bağlantı · Görsel · Sabitlenmiş) uçta karşılıksız.**
`searchChannelMessages` yalnız `Message.content` üstünde eşleşiyor; ek/bağlantı/görsel varlığı ve
`pinned` bayrağı sorguya hiç girmiyor. `MessageSearchResult` de bu alanları taşımadığı için
istemci tarafı süzme de mümkün değil. Çipler **çizilir**, `buildMessageSearchFilters` onları uca
**göndermez**; panel bunun yerine `server.search.unsupported` uyarısını gösterir. Test:
`search-filters.test.ts` → "içerik çipleri ve thread anahtarı hiçbir parametre üretmez".

**T2 — `Yalnızca thread yanıtlarında ara` uçta imkânsız, eksik değil.**
Sorgu `m."threadParentId" IS NULL AND m."threadId" IS NULL` ile thread yanıtlarını baştan
dışarıda bırakıyor. Anahtar açıkken uydurma bir parametre göndermek her aramayı boş döndürürdü.
Gerekli iş: `search-service.ts`'e `threadOnly` kipi (yukarıdaki iki koşulun tersi) + route şeması.

**T3 — Katılımcı kamera/mikrofon durumu ses durum sözleşmesinde yok.**
`VoiceStateParticipantDTO` = `{ userId, username, displayName, avatarUrl, isDeafened, isScreenSharing? }`.
SPEC §4.1'in "kamera açık" ikonu ve "mikrofon kapalı"nın _sağır_ olmayan hâli çizilemiyor. Gerekli
iş: `isMuted` ve `isCameraEnabled` alanlarının ses durum yayınına eklenmesi (Ş7'nin görsel
yenilemesiyle birlikte değerlendirilmeli).

**T4 — Üye arama sunucu tarafına bağlı değil.**
Kutu bugün yalnız `detail.members` sayfasını süzüyor. Ş2'nin `q` parametresi
(`GET /servers/[serverId]/members?q=`) hazır; bağlanması sayfalama davranışını da (sayfa 100'de
kesiliyor) beraberinde getirdiği için bu şeride alınmadı. Model tarafı hazır:
`matchesMemberQuery` istemci süzmesinin tek kapısı.

**T5 — Sonuç sıralaması tek yönlü.** Bkz. sapma S8.

---

## 4. Doğrulama çıktısı

| Komut                                  | Sonuç                                                     |
| -------------------------------------- | --------------------------------------------------------- |
| `pnpm --filter @wizards/types test`    | **529 / 529** · fail 0                                    |
| `pnpm --filter @wizards/db test`       | **146 / 146** · fail 0                                    |
| `pnpm --filter @wizards/web typecheck` | EXIT 0 (sessiz = temiz)                                   |
| `pnpm --filter @wizards/web lint`      | EXIT 0                                                    |
| `pnpm --filter @wizards/web test`      | **tests 7011 · pass 7008 · fail 0 · skipped 3** (52.9 sn) |

Şeridin kendi testleri (43 yeni test — 15 model + 12 filtre + 16 bileşen):

```bash
cd apps/web && node --import tsx --test --test-force-exit \
  src/lib/servers/member-panel-model.test.ts \
  src/lib/messages/search-filters.test.ts \
  src/components/shell/server-member-panel.test.tsx
# tests 43 · suites 16 · pass 43 · fail 0
```

E2E parity satırı açıldı ama **koşulamadı** (yerel Playwright ortamı bu oturumda ayağa
kaldırılmadı): `apps/web/e2e/specs/design/server-parity.spec.ts` → `Ş5 · sağ panel` bloğu
8 parity testi (4 çözünürlük × 2 tema) + 2 davranış testi taşıyor.

---

## 5. Sonraki şerit için not

**N1 — Sağ panelin içerik seçimi artık paylaşılan bir store'da.**
`lib/servers/right-panel-store.ts` → `setServerRightPanelContent("members" | "search")`.
**Ş6** (metin kanalı başlığı) §3.1'in `ara` ve `Üyeler` düğmelerini çizerken bu store'u
kullanmalı; `chat-area.tsx`'teki geçici bağlama (`openSearch` / `toggleMembersPanel`) o zaman
başlığın kendi kontrollerine taşınır. Aktif durum çipi için okunacak değerler:
`useServerRightPanelContent()` + `useAppStore(state => state.memberPanelCollapsed)`.

**N2 — Panelin kapatma düğmesi `memberPanelCollapsed`'i `true` yapar.**
Geri açan tek kontrol şu an kanal başlığındaki `Üyeler` düğmesi (Ş5 masaüstünde görünür yaptı) ve
Ayarlar › Görünüm'deki `y5` anahtarı. Ş6 başlığı yeniden çizerken bu düğmeyi **düşürmemeli**,
yoksa kapatma tek yönlü bir kapı olur.

**N3 — `jumpToMessage` artık `lib/messages/jump-to-message.ts`'te.**
`chat-area.tsx` onu sarıyor. Mesaj listesine atlayan yeni bir yüzey (Ş6'nın sabitlenen mesaj
çubuğu, Ş9'un bildirim penceresi) bu yardımcıyı çağırmalı; ikinci bir kopya iki farklı
vurgulama süresi üretir.

**N4 — `MessageSearchPanel` ile `ChannelSearchPanel` aynı dosyada, aynı getirme kancasında.**
`useMessageSearchResults(request | null)` — `request` `null` iken istek atmaz ve boş sonuç
döndürür (efekt gövdesinde `setState` yok; `react-hooks/set-state-in-effect` bu repoda **hata**).
Yeni bir arama yüzeyi bu kancayı çağırsın.

**N5 — `SERVER_METRICS`'e sekiz alan eklendi.**
`rightPanel.titleIconSize/closeIconSize/searchIconSize/statusIconSize/copyLinkIconSize`,
`search.queryIconSize/fieldChevronSize`, `layout.rightPanelOverlayZIndex`. Beşi referans HTML'in
`width="N" height="N"` değerlerinden birebir; `rightPanelOverlayZIndex` §11'in katmanı ve
`sidebar.searchPopoverZIndex`in (28) **altında** — dar ekranda `⌘K` popover'ı panelin arkasına
düşmesin diye.

**N6 — Kabuğun içerik satırı artık `relative`.**
`wizards-shell.tsx` → `<div className="relative flex min-w-0 flex-1 md:gap-0">`. §11'in binen
katmanı bu konumlanma bağlamına yaslanıyor; sınıf kaldırılırsa panel `<1400px`'te viewport'a
yapışır.

**N7 — Ş4 ile çakışma yok.** `channel-sidebar.tsx`'e dokunulmadı; `dnd-kit` sıralaması,
`collapsedCategories` store'u ve `UserProfileFooter` bu şeritte hiç okunmadı.
