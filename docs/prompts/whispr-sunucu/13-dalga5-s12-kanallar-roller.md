# Ş12 — Kanallar ve Kategoriler · Roller ve Yetkiler (Dalga 5)

> Önce oku: `00-ortak-baglam.md`, `SPEC-SUNUCU.md` §8.4, §8.5.
> Bağımlılık: **Ş0**, Ş8 (`PermissionGroupCard`), Ş11 (ayarlar kabuğu). Paralel: Ş11, Ş13.

---

## 1. Kanallar ve Kategoriler (§8.4)

**Üst çubuk:** `+ Kategori ekle` (primary çerçeveli) ve `+ Kanal ekle` (primary dolgu) —
**ikisi de `+` ikonlu**, Ş8'in pencerelerini açar (K11: ayarların üstünde çizilir, kapanınca
ayarlara dönülür). Sağda not "Kanalları sürükleyip kategoriler arasında taşı, sırayı değiştir."

**Kategori kartı:** başlık şeridi (`surface-secondary/.55`) — sürükleme tutamacı (6 nokta),
kategori adı, kanal sayısı çipi, sağda `26×26` düğmeler: **yukarı · aşağı · `+` kanal ekle ·
düzenle · sil** (danger hover).

**Kanal satırı:** sürükleme tutamacı, tür ikonu (yazı muted `#`, ses success hoparlör), ad,
erişim çipi, sağda düzenle · sil.

**Erişim çipi renkleri:** `Herkese açık` = **success** · `Kilitli` = warning · `Gizli` = danger ·
`Role bağlı` = primary. (Preset eşlemesi Ş8 tablosuyla aynı.)

- Sürükleme mevcut dnd-kit + `channels/reorder` · `categories/reorder` uçlarını kullanır.
- **Klavye alternatifi zorunlu:** yukarı/aşağı düğmeleri gerçek sıralama yapar (a11y §12).
- Silme onay ister; son kanalın silinmesi engelleniyorsa mevcut kural korunur.
- Bu bölüm yalnız `MANAGE_CHANNELS` yetkisi olana render edilir.

## 2. Roller ve Yetkiler (§8.5)

İki kolon (`212 / 1fr`).

**Sol:** rol listesi — renk noktası + ad + üye sayısı; seçili satır `primary/.14`.
Sıra `Role.position`'a göre; `@everyone` en üstte, `Sunucu Sahibi` en altta.
Altta kesikli çerçeveli `+ Rol oluştur`.

**Sağ (seçili rol):**

- Başlık: renk noktası + rol adı + sağda `N yetki seçili` çipi (**canlı** sayılır,
  `permission-groups.ts` → `countSelected`).
- `Rol adı` input (**max 32**, K6) + `Renk` swatch'ları (6: `text-muted · info · success ·
warning · danger · primary`) → `Role.color` tamsayısına eşlenir; eşleme tablosu tek yerde.
- `Etiketlenebilir` `ToggleRow` — "Üyeler bu rolü @ ile çağırabilir." → `mentionable`.
- `HAZIR AYARLAR`: `Üye` · `Moderatör` · `Admin` çipleri; tıklanınca yetki setini değiştirir
  (Ş0'ın preset tanımları).
- **Yetki grupları** — her biri `PermissionGroupCard`:

| Grup         | Yetki sayısı                    | Varsayılan (SPEC örneği) |
| ------------ | ------------------------------- | ------------------------ |
| Genel        | 5                               | 5/5                      |
| Ses ve Medya | 5                               | 5/5                      |
| Moderasyon   | 4                               | 4/4                      |
| Yönetim      | 4 (`Yönetici` `yalnızca sahip`) | 0/4                      |

Grup başlığında `seçili/toplam`; tamamı seçiliyse sayı primary. Her satırda 38×21 anahtar.
`Yönetici` satırı **sahip dışına render edilmez**.

- En altta danger kartı `Rolü sil` — "Roldeki üyeler @everyone yetkilerine döner." +
  `yalnızca sahip` çipi + `Rolü sil` düğmesi.
  `@everyone`, `Sunucu Sahibi` ve `managed` roller silinemez — mevcut `isProtectedRole` /
  `getRoleGuardCopy` guard'ları **korunur**.

## 3. Rol oluşturma — **aynı ekranın içinde, ayrı pencere yok** (§8.5)

`+ Rol oluştur`a basılınca:

- Sol listede en alta `TASLAK` rozetli, seçili renkli satır eklenir (ad boşken `Yeni rol`);
  mevcut roller seçimsiz kalır; `+ Rol oluştur` düğmesi primary tonuna geçer.
- Sağ panel taslağa geçer: başlıkta `Yeni rol` (ad girilince ada döner) + `Yeni rol` rozeti,
  `Rol adı` boş (`Örn. Yayın Ekibi`), renk varsayılan primary, `Etiketlenebilir` kapalı,
  yetkiler **Üye** ön ayarıyla (yalnız Genel · 5 yetki).
- `Rolü sil` kartının yerini **alt çubuk** alır: solda durum metni — ad boşken warning
  "Devam etmek için bir rol adı gir.", doluysa "Rol, @everyone üstünde N yetkiyle oluşturulacak." —
  sağda `Vazgeç` ve `Rol oluştur` (ad boşken pasif).
- `Vazgeç` taslağı atar ve önceki seçili role döner.
- Uç: `POST /servers/[serverId]/roles` (`CreateWorkspaceRoleSchema`).

---

## Sınırlar

- Üyelere rol atama Ş13'te.
- Yeni yetki anahtarı üretilmez; 18 yetki mevcut `WorkspacePermissionKey` kümesinden.
- Kanal/kategori pencerelerinin gövdesi Ş8'de; burada yalnız açılır.

---

## Kabul kriterleri

- [ ] Kanallar: iki ekleme düğmesi de `+` ikonlu ve pencere açıyor; ayarın üstünde çiziliyor,
      kapanınca ayarlara dönülüyor.
- [ ] Sürükleme + yukarı/aşağı düğmeleri gerçek sıralamayı yazıyor; klavyeyle sıralama mümkün.
- [ ] Erişim çipi renkleri doğru — **`Herkese açık` yeşil (success)**.
- [ ] Roller: 4 grup `5/5 · 5/5 · 4/4 · 0/4` ile geliyor; başlıktaki `N yetki seçili` canlı sayıyor;
      3 hazır ayar yetki setini değiştiriyor.
- [ ] Rol adı 32'de kesiliyor; renk swatch'ı `Role.color`'a doğru eşleniyor.
- [ ] Rol oluşturma **ayrı pencere değil**: TASLAK satırı, boş taslak paneli, alt çubuk,
      ad boşken pasif buton, `Vazgeç` geri dönüşü — hepsi testli.
- [ ] `Yönetici` yetkisi ve `Rolü sil` sahip dışına render edilmiyor (negatif test).
- [ ] Korunan roller silinemiyor; mevcut guard metinleri korundu.
- [ ] Yeni hex yok; typecheck/lint/test yeşil.

## Rapor

`raporlar/s12-kanallar-roller.md` — 18 yetkinin `WorkspacePermissionKey` eşleme tablosu girer.
