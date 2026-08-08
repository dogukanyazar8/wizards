# Faz 7 — Kapanış (Görev 20 + devralınan borç)

> **Önce oku:** `docs/prompts/grup-sohbeti/00-ortak-baglam.md`.
> **Önkoşul:** Faz 3–6 tamam.

Bu fazda yeni özellik yazılmaz. Üç iş var: devralınan borcu kapatmak, tam doğrulama,
ve kod yazarak doğrulanamayan tek şeyi elle test etmek.

---

## 20.1 Devralınan borcu kapat

Ortak bağlam §6'daki maddeler. Öncelik sırasıyla:

### (a) Task 7 düşman gözüyle incelenmedi — **en yüksek öncelik**

`updateGroupConversation` ve `defaults.writeGroupMetadata`
(`apps/web/src/lib/dm/group-service.ts`) yazıldı, 1843/1843 yeşil, iki mutation
kanıtı alındı, ama bağımsız inceleme dispatch'i kesildi. Şunları satır satır oku ve
doğrula:

- `patch.name === undefined` ("değiştirme") ile `patch.name === null` ("temizle")
  ayrımı hem `updateGroupConversation`'da hem `writeGroupMetadata`'nın `update.data`
  spread'lerinde korunuyor mu? `null` bir ad gerçekten Prisma'ya `name: null` olarak
  ulaşıyor mu, yoksa spread guard'ı tarafından düşürülüyor mu?
- Ad ve foto aynı istekte değişince **her ikisi de** kalıcılaşıyor mu? (Tek sistem
  satırı yazılması ve `NAME_CHANGED`'in kazanması bilinçli karardır, hata değil.)
- `writeGroupMetadata` tek `prisma.$transaction` kullanıyor ve `unreadCount`'a
  dokunmuyor mu?
- `systemValue` `NAME_CHANGED`'de yeni adı, `ICON_CHANGED`'de `null` taşıyor mu?
  `systemTargetUserIds` ikisinde de `[]` mi? `content` `""` mi?

**Bilinen kapatılmamış boşluk:** ad ve foto aynı istekte değişince "ad kazanır"
kuralını doğrudan test eden vaka yok. Ekle.

**Performans notu:** `updateGroupConversation`, boş-patch erken dönüşünden **önce**
`getDeletedMessageLabel`'i await ediyor — no-op istek bu aramanın bedelini ödüyor.
Kardeş `addGroupMembers` no-op yolunun aynısını yapıp yapmadığını kontrol et; ikisi
tutarlıysa bırak, değilse hizala.

### (b) Fonksiyonlar arası sapma taraması

Beş operasyon (`createGroupConversation`, `addGroupMembers`, `removeGroupMember`,
`leaveGroupConversation`, `updateGroupConversation`) artık tek dosyada. Yalnızca
hepsi bir aradayken görünen tutarsızlıkları ara:

- guard sıraları farklı mı?
- aynı koşul için farklı hata kodu dönen var mı?
- transaction şekilleri ayrışmış mı?
- dışarı çıkarılması gereken tekrarlanan mantık var mı?

### (c) İkinci inceleme almamış fix dalgaları

Task 5 ve Task 6'nın fix dalgaları controller tarafından yazıldı, bağımsız ikinci
inceleme dispatch'i almadı. `apps/web/src/lib/dm/group-service.test.ts`'i baştan
sona oku: hiçbir testin boş assertion taşımadığını ve hiçbir beklenen değerin bozuk
çıktıya uydurulmadığını doğrula.

### (d) Kozmetik

`packages/types/src/group-dm.test.ts`'te `assertSchemaBehaviorCoverage` kendi
describe bloğunda duruyor; kardeş dosyalarda (`workspace.test.ts`, `badges.test.ts`)
şema bloğunun içinde. İstersen hizala, istemezsen bırak — davranışa etkisi yok.

---

## 20.2 Tam doğrulama

```bash
pnpm --filter @wizards/types test
pnpm --filter @wizards/web test
pnpm --filter @wizards/mobile test
pnpm --filter @wizards/mobile test:components
pnpm --filter @wizards/types typecheck
pnpm --filter @wizards/web typecheck
pnpm --filter @wizards/mobile typecheck
```

Hepsi yeşil olmalı — ortak bağlam §4'teki eşzamanlı-oturum kırıkları hariç.
Bir kırık §4'te listeli değilse **bizimdir**, düzeltilir.

Migration'ın Prisma'nın gerçekten okuduğu dizinde olduğunu teyit et:

```bash
ls packages/db/prisma/rebaseline-migrations/20260807120000_group_dm/migration.sql
```

`packages/db/prisma/migrations/` altında **olmamalı**.

---

## 20.3 Elle test — soket tahliyesi

Bunun birim testi Faz 3'te var, ama gerçek soket üzerinde bir kez doğrula. Spec'in
en kritik güvenlik kalemi:

1. İki oturum aç (iki tarayıcı profili veya bir web + bir mobil).
2. Bir grup kur, ikisini de üye yap.
3. İki oturumda da grubu **açık tut** (soketler `dm:<id>` odasına katılmış olsun).
4. Sahip olarak ikinci kullanıcıyı gruptan çıkar.
5. Gruba yeni bir mesaj gönder.
6. **Çıkarılan oturum o mesajı almamalı.** Alıyorsa `evictRemovedGroupMember`'ın
   `socketsLeave` çağrısı çalışmıyor demektir ve bu bir veri sızıntısıdır.

Ayrıca doğrula: çıkarılan kullanıcının gelen kutusundan satır düşüyor, sohbeti
açıksa kapanıyor.

---

## 20.4 Ek uçtan uca kontroller

Kod yazmadan, gerçek uygulamada:

- [ ] Sohbetler ekranındaki `+` butonu grup oluşturma ekranını açıyor
- [ ] 2 arkadaş seçilmeden "İleri" açılmıyor
- [ ] Adsız grup kurulunca başlık üye adlarından türüyor
- [ ] Grup fotoğrafı hem oluşturmada hem sonradan düzenlemede kaydediliyor ve
      gelen kutusu satırında görünüyor (`iconUrl` sözleşme boşluğu Faz 0'da kapandı,
      burası onun uçtan uca kanıtı)
- [ ] Sistem satırları akışta ortalanmış çiziliyor ve **okunmamış rozeti yakmıyor**
- [ ] Grup mesajı gelen kutusunda `"Ad: mesaj"` önekiyle görünüyor
- [ ] Sahip olmayan üye "Üye ekle"yi ve çıkarma düğmelerini görmüyor
- [ ] Sahip gruptan ayrılınca sahiplik en eski üyeye geçiyor
- [ ] Son üye ayrılınca sohbet kayboluyor
- [ ] Web ve mobil aynı grubu aynı şekilde gösteriyor (K1 paritesi)

---

## 20.5 Rapor

`.superpowers/sdd/groupdm/task-20-report.md`:

- Hangi testlerin koştuğu ve gerçek sayıları
- Devralınan borcun her maddesinin durumu (kapatıldı / bırakıldı + neden)
- Elle test sonuçları, özellikle 20.3
- Atlanan veya bloke olan her madde açıkça

Ayrıca `.superpowers/sdd/progress.md`'deki "Grup Sohbeti (Group DM)" bölümünü
kapat.

---

## Kapanış notu

Hiçbir şey commit edilmedi — 20 görevin tamamı çalışma ağacında. Commit kararı
kullanıcınındır. Kapanış raporunda commit önerme, yalnızca durumu bildir.
