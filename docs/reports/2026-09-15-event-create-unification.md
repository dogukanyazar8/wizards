# Etkinlik oluşturma — ortak form ve görünürlük

## Değişiklik

- Etkinlikler ekranı ve sunucu ayarlarındaki **oluşturma** eylemi aynı `EventCreateModal` bileşenini kullanır. Sunucu ayarlarında mevcut sunucu detayı kullanılır; gereksiz sunucu listesi/detay isteği yapılmaz. Açıklama alanı iki akışta da korunur (180 karakter).
- Saydam `datetime-local` input yerine düğmeyle açılan, uygulamanın Input bileşenlerini kullanan görünür tarih/saat alanları bulunur. Takvim ve saat tarayıcının yerel kontrolleridir; klavyeyle düzenlenebilir. Geçersiz takvim günleri sessizce sonraki aya taşınmaz.
- Süreler 30, 45, 60, 90 ve 120 dakika. Yatay kaydırma ve Sol/Sağ/Home/End klavye seçimi desteklenir.
- Sunucu simgesi 18 → 30 tasarım pikseli. Metin/ses/sahne kanallarının tür ikonları eklendi. Kart zemini, fontlar ve seçili düğmeler tema değişkenlerini kullanır. Modal, sunucu ayarlarının üstünde ortak katman sistemiyle açılır.
- Sunucu zorunlu, kanal/harici yer isteğe bağlı. `Yer daha sonra belirlenecek` seçimi mevcut konumu temizler. Harici bağlantı kipi seçilirse geçerli bağlantı gerekir. Kartlar/detay/ajanda boş yer yerine açıklayıcı metin gösterir.
- Başarılı oluşturma sonrası Etkinlikler, Anasayfa yaklaşan etkinlikleri ve ilgili sunucu projeksiyonları geçersiz kılınır; mevcut önbellek verisi silinmez. Web API, başarılı kayıttan sonra mevcut `event:created` olayını yayınlar. Anasayfa etkinlik değişikliklerini dinler.

## Kök neden ve kapsam

Genel oluşturma formu, API sözleşmesi yer seçimini isteğe bağlı kabul ettiği halde kanalı zorunlu tutuyordu. Eski sunucu oluşturma akışı sadece sunucu etkinlik önbelleğini yeniliyordu; genel akış da Anasayfa önbelleğini yenilemiyordu. `publishEventCreated` tanımlıydı fakat oluşturma tarafından çağrılmıyordu.

Etkinlikler SQL sorgusu kanalı `LEFT JOIN` ile okuyor. Anasayfa sorgusu sunucu üyeliği, zaman ve durumla sınırlandırılıyor; kanal zorunluluğu yok. Bu nedenle görünürlük filtresi gevşetilmedi. Kanalsız kayıtların her iki projeksiyonda kaldığı testlerle doğrulandı. Gerçek kullanıcı kaydıyla yeniden üretim yapılamadığı için bildirilen kaybolmanın tek sebebinin önbellek olduğu iddia edilmiyor.

Sunucu **düzenleme** penceresinin mevcut formu korunur; başarılı güncelleme de ortak önbellek yenilemesini kullanır.

## Doğrulama

- PASS: 321 web odaklı test (form, liste/projeksiyon, sorgu kapsamı, sayaçlar, yayın, önbellek, sunucu formu, API ve ilgili çizim testleri).
- PASS: 34 ortak etkinlik sözleşme testi.
- PASS: web TypeScript `tsc --noEmit`, değişen dosyalarda ESLint, `git diff --check`.
- ENV BLOCKED: `graphify update .` AST çıkarımını tamamladı; `.graph.tmp.json` → `graph.json` atomik değiştirmesi `WinError 5` ile reddedildi. Mevcut grafik bu değişikliğin güncel çıktısı olarak kabul edilmedi; kilit zorlanmadı.
- Testler sahte veritabanı/QueryClient ve sunucu çizimi kullanır; gerçek veritabanında etkinlik oluşturulduğu anlamına gelmez.
- NOT RUN: oturumlu web/Tauri oluşturma ve görsel kabul. Yerel tarayıcı önce giriş ekranına yönlendi, sonra `ERR_CONNECTION_REFUSED` verdi. Yerel dev sunucusu yeniden başlatıldı; tarayıcı aracının dahili hata sayfasına ilişkin URL engeli ve bekleyen kullanıcı girişi nedeniyle etkileşim tamamlanamadı.
- Yerel komut çıktıları: `.codex/events-final-tests.log`, `.codex/events-types-tests.log`, `.codex/events-typecheck.log`, `.codex/events-lint.log`, `.codex/events-dev.log`.

## Additional observations

- **medium** — `lib/events/create-form.ts:selectEventPlaceServers`: Genel ekranın sunucu listesi OWNER/ADMIN ile sınırlı; rolle verilen MANAGE_EVENTS yetkisini liste API'si taşımıyor. Sunucu bağlamındaki yeni form bu listeye ihtiyaç duymaz. Sunucu tarafındaki yetki kontrolü korunur.
- **medium** — `lib/servers/event-form.ts`, `packages/types/src/workspace.ts`: Mevcut sunucu düzenleme formu 60 karakter başlık ve aynı gün başlangıç/bitiş kullanıyor; genel oluşturma sözleşmesi 120 karaktere izin veriyor ve süre gece yarısını aşabiliyor. Bu eski düzenleme kısıtları ayrıca birleştirilmelidir.
- **medium** — `components/events/event-create-modal.tsx:toEventPlaceChannels`: Workspace kanal sözleşmesi STAGE tipini ayrı taşımıyor. Canlı yayın/topluluk türleri için sahne kanalı seçimi bu mevcut API kısıtına tabi; konumsuz oluşturma artık mümkün.
