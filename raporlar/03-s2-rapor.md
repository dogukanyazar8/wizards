# Dalga 1 Ş2 raporu

## Sonuç

`GET /api/v1/discover/people`, `GET /api/v1/discover/channels` ve saatlik kanal hareketi rollup işi uygulandı. Commit/push yapılmadı. Sol ray, uygulama nav'ı ve kullanıcı barına dokunulmadı.

## Uygulama özeti

- Kişiler ucu `listFriendSuggestions(userId)` fonksiyonunu doğrudan çağırıyor; kendi HTTP ucuna istek atmıyor. Arama yalnız sınırlı öneri havuzunu daraltıyor. Presence gizlilik kararı ve `INVISIBLE -> offline`, ortak sunucu/tag zenginleştirmesi ve gönderilmiş istek durumu toplu sorgularla üretiliyor.
- Kanallar ucu yalnız `TEXT`, herkese açık/keşfedilebilir sunucu ve `@everyone` için görünür kanalları listeliyor. Açık `VIEW_CHANNEL` deny fail-closed eleniyor. `Channel` modelinde kalıcı `isPrivate` kolonu olmadığı için değer mevcut izin çözümleyicisinin `@everyone` görünürlüğünden türetiliyor.
- Kanal sorgusu parametreli SQL kullanıyor; mesaj içeriği veya mesaj satırı dönmüyor. Son 24 kapalı saat toplanıyor; sıralama `dailyMessageCount desc, id asc`, imleç `c|count|id`, sayfa boyu 24. `sort` yok sayılıyor.
- Avatar önizlemesi görünür çevrimiçi üye Redis setinden en fazla üç kullanıcı seçiyor; `INVISIBLE` kullanıcılar bu sete alınmıyor.
- Rollup kapanan son tam UTC saati sayıyor, silinmiş mesajları ve görünmez kanalları kapsam dışı bırakıyor, `createMany(skipDuplicates)` ile idempotent yazıyor, 30 günden eski satırları buduyor.
- `lib/outbox/worker.ts` saatlik bakım listesine tek `rollUpDiscoverChannelActivity` çağrısı eklendi. Mevcut görev-başına `try/catch` izolasyonu korunuyor.
- `discover:people` ve `discover:channels` hız sınırları `120/60sn` eklendi.

## TDD kanıtı

- Kişiler testleri önce eksik servis/route modülü nedeniyle RED, uygulama sonrası GREEN.
- Kanallar testleri önce eksik servis/route modülü nedeniyle RED, uygulama sonrası GREEN.
- Rollup testi önce eksik modül nedeniyle RED; worker entegrasyon testi çağrı çıkarılarak `false !== true` RED verdi; çağrı geri eklenince GREEN.
- Son odaklı koşu: **30/30 PASS**, 7 suite, 0 fail.

## Doğrulama

| Kapı                                   | Sonuç | Kanıt                                                                                                                                                         |
| -------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dalga 0 DB generate                    | PASS  | Prisma Client üretildi                                                                                                                                        |
| Dalga 0 types                          | PASS  | 20/20                                                                                                                                                         |
| Dalga 0 web discover                   | PASS  | 75/75                                                                                                                                                         |
| Ş2 odaklı testler                      | PASS  | 30/30, 7 suite                                                                                                                                                |
| Ş2 sahip olunan ESLint                 | PASS  | 14 dosya, 0 hata                                                                                                                                              |
| `pnpm --filter @wizards/web typecheck` | FAIL  | Ş2 dışı 3 TS2307: eksik `events/events-query`, `events/client`, `events/realtime` modülleri                                                                   |
| `pnpm --filter @wizards/web lint`      | PASS  | Ön kapı 10/10; tüm ESLint 0 hata                                                                                                                              |
| `pnpm --filter @wizards/web test`      | FAIL  | 4436 toplam; 4424 PASS, 11 FAIL, 1 skipped. Ş2 dışı: mobile thread-follow route-contract, Ş4 event hook/servis/count testleri ve `components/dm` audit budget |

İstenen `typecheck && lint && test` zinciri typecheck hatalarında durdu. Lint ve test gerçek durumlarını ayırmak için ayrıca çalıştırıldı. Tam kapı hatalarının dosyaları bu görevin sahiplik listesi dışında ve çalışma ağacında önceden/eşzamanlı değişmiş durumda; değiştirilmedi.

## Sınırlar

- `graphify query` yalnız gezinme için kullanıldı; kaynak, sözleşme ve testlerle doğrulandı. `graphify update .`, yalnız sahip olunan dosyaları değiştirme sınırı nedeniyle çalıştırılmadı.
- Ölçü gerektiren UI işi yoktu; referans HTML'den ölçü tahmini yapılmadı.
- Commit/push yok.
