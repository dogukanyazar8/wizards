import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { EN_MESSAGES } from "@/lib/locale/messages/en";
import { TR_MESSAGES } from "@/lib/locale/messages/tr";

/**
 * Sunucu ekranı paketinin metin sözleşmesi — `SPEC-SUNUCU.md` §2–§8, `00-ortak-baglam.md` §7.
 *
 * Aşağıdaki tablo tasarım kaynağından **kopyalanmıştır**. Bir cümleyi kısaltan, uzatan ya da
 * "iyileştiren" her değişiklik burada kırmızı verir; kural PROMPT §4'ün "TR karşılığı SPEC'teki
 * metnin birebir aynısı olsun" maddesidir.
 *
 * Beş kardeşi (`discover` · `events` · `mentions` · `messages` · `settings`) `lib/locale/`
 * altında yaşıyor; bu dosya Ş14 şerit dosyasının **açıkça verdiği** yolda
 * (`lib/servers/server-screen-copy.test.ts`) duruyor. Sapma raporda kayıtlı.
 *
 * Genel sözlük denetimi (iki dilin anahtar kümesi, boş değer, çoğul) `messages.test.ts`
 * dosyasındadır; bu dosya yalnız `server.*` ağacına bakar.
 */

const TR: Record<string, string> = TR_MESSAGES;
const EN: Record<string, string> = EN_MESSAGES;

const SERVER_KEYS = Object.keys(TR).filter((key) => key.startsWith("server."));

/**
 * SPEC'te birebir verilen cümleler. Her satırın yanında hangi bölümden geldiği yazılı;
 * bir metni değiştirmek isteyen önce SPEC'i değiştirmek zorunda.
 */
const SPEC: Record<string, string> = {
  // §2.2 sunucu menüsü — tam olarak beş satır
  "server.menu.invite": "Davet bağlantısı",
  "server.menu.createCategory": "Kategori oluştur",
  "server.menu.createChannel": "Kanal oluştur",
  "server.menu.settings": "Sunucu ayarları",
  "server.menu.leave": "Sunucudan ayrıl",

  // §2.1 / §2.3 kenar çubuğu
  "server.sidebar.header.presence": "{online} çevrimiçi · {members} üye",
  "server.sidebar.search.label": "Kanal ara",
  "server.sidebar.category.hidden": "{count} gizli",

  // §4.1 üye listesi
  "server.panel.members.title": "Üyeler · {count}",
  "server.panel.members.searchPlaceholder": "Üye ara",
  "server.panel.group.online": "Çevrimiçi",
  "server.panel.group.offline": "Çevrimdışı",

  // §4.2 ses kanalı katılımcıları
  "server.panel.voice.title": "Ses kanalı",
  "server.panel.group.inChannel": "Bu kanalda",
  "server.panel.group.notInChannel": "Kanalda değil",
  "server.panel.voice.invite": "Davet et",
  "server.panel.voice.invited": "Gönderildi",
  "server.panel.voice.copyInvite": "Davet bağlantısı kopyala",

  // §4.3 arama paneli
  "server.panel.search.title": "Kanalda ara",
  "server.search.mode.basic": "Basit",
  "server.search.mode.advanced": "Gelişmiş",
  "server.search.field.author": "Kimden",
  "server.search.field.channel": "Kanal",
  "server.search.field.dateRange": "Tarih aralığı",
  "server.search.field.contains": "İçeriyor",
  "server.search.dateRange.30d": "Son 30 gün",
  "server.search.contains.file": "Dosya",
  "server.search.contains.link": "Bağlantı",
  "server.search.contains.image": "Görsel",
  "server.search.contains.pinned": "Sabitlenmiş",
  "server.search.threadOnly": "Yalnızca thread yanıtlarında ara",
  "server.search.run": "Aramayı çalıştır",
  "server.search.sort.newest": "En yeni",
  "server.search.results.count": "{count} sonuç",
  "server.search.results.filtered": "{count} sonuç · filtreli",

  // §3.1 metin kanalı başlığı (Ş6)
  "server.channel.header.accessCount": "{count} üye erişebilir",
  "server.channel.header.notif.mentions": "Yalnızca bahsedilmeler",
  "server.channel.header.notif.muted": "Sessize alındı",
  "server.channel.header.members": "Üyeler",
  // §3.4 bestekar
  "server.channel.composer.placeholder": "#{channel} kanalına yaz",

  // §5.1 ses kanalı başlığı (Ş7)
  "server.voice.header.participants": "{count} katılımcı",
  "server.voice.header.minutes": "{count} dakikadır bağlı",
  "server.voice.header.cameras": "{count} kamera açık",
  "server.voice.header.sharing": "{name} ekran paylaşıyor",
  "server.voice.header.krispActive": "Krisp aktif",
  // §5.2 katılımcı kartı
  "server.voice.tile.you": "SEN",
  "server.voice.tile.listeningShort": "Sessiz dinliyor",
  "server.voice.tile.mutedShort": "Mikrofon kapalı",
  "server.voice.tile.deafenedShort": "Hoparlör kapalı",
  "server.voice.tile.cameraPlaceholder": "Kamera görüntüsü",
  "server.voice.tile.role.owner": "Sunucu",
  "server.voice.tile.role.admin": "Yönetici",
  // §5.3 ekran paylaşımı
  "server.voice.share.presenter": "{name} ekranını paylaşıyor",
  "server.voice.share.live": "CANLI",
  "server.voice.share.placeholder": "Ekran görüntüsü yer tutucusu · 1920×1080",
  // §5.4 kontrol çubuğu
  "server.voice.controls.leave": "Ayrıl",

  // §6.1 kategori penceresi
  "server.modal.category.title": "Kategori oluştur",
  "server.modal.category.hint": "En fazla {max} karakter. Kenar çubuğunda büyük harfle görünür.",
  "server.modal.category.previewEmpty": "YENİ KATEGORİ",
  "server.modal.category.previewEmptyChannels": "Henüz kanal yok — sonra ekleyebilirsin",
  "server.modal.category.note":
    "Kategori düzeyinde izin veya açıklama yok. İzinler kanal bazında ayarlanır.",
  "server.modal.category.submit": "Kategori oluştur",

  // §6.2 kanal penceresi — dört adım
  "server.modal.channel.step.access": "Erişim",
  "server.modal.channel.adminOnly": "Yalnızca yönetici",
  "server.modal.channel.kind.text": "Yazı kanalı",
  "server.modal.channel.kind.textDescription": "Mesaj, dosya ve bağlantı paylaşımı.",
  "server.modal.channel.kind.voice": "Sesli kanal",
  "server.modal.channel.kind.voiceDescription": "Anlık ses, video ve ekran paylaşımı.",
  "server.modal.channel.nameHintText":
    "Harf, sayı, boşluk, tire ve alt çizgi kullanabilirsin; yazımın korunur.",
  "server.modal.channel.nameHintVoice":
    "Harf, sayı, boşluk, tire ve alt çizgi kullanabilirsin; yazımın korunur.",
  "server.modal.channel.topicHint": "Kanalın başlığında görünür.",
  "server.modal.channel.access.PUBLIC": "Herkese açık",
  "server.modal.channel.access.PUBLIC.description": "Herkes görür ve kullanır.",
  "server.modal.channel.access.LOCKED_VISIBLE": "Kilitli ama görünür",
  "server.modal.channel.access.LOCKED_VISIBLE.description":
    "Herkes görür, kullanmak için izin gerekir.",
  "server.modal.channel.access.PRIVATE": "Gizli / özel",
  "server.modal.channel.access.PRIVATE.description": "Normal üyeler göremez.",
  "server.modal.channel.access.ROLE_GATED": "Role bağlı",
  "server.modal.channel.access.ROLE_GATED.description":
    "Yalnızca seçilen roller görür ve kullanır.",
  "server.modal.channel.summaryEmpty": "Devam etmek için bir kanal adı gir.",
  "server.modal.channel.summaryVoice": "Sesli kanal {category} altında oluşturulacak.",

  // §6.2 · 4. adım
  "server.channel.slowMode.title": "Yavaş mod",
  "server.channel.slowMode.description": "Kullanıcının iki mesaj arasında beklemesi gereken süre.",
  "server.channel.bitrate.title": "Ses bitrate'i",
  "server.channel.bitrate.description":
    "Yüksek değer daha iyi ses kalitesi ve daha fazla bant genişliği kullanımı sağlar. Varsayılan: 64 kbps.",
  "server.channel.userLimit.title": "Kullanıcı limiti",
  "server.channel.userLimit.description": "0, sunucunun üst sınırı olan {max} kişiyi kullanır.",
  "server.channel.userLimit.default": "{max} kişi (varsayılan)",
  "server.channel.rtcRegion.title": "RTC bölgesi",
  "server.channel.rtcRegion.description": "Ses bağlantısının yönlendirileceği bölgeyi belirler.",
  "server.channel.rtcRegion.auto": "Otomatik",
  "server.channel.videoQuality.title": "Video kalitesi",
  "server.channel.videoQuality.auto": "Otomatik — önerilen",
  "server.channel.videoQuality.full": "Tam kalite",

  // §6.3 davet penceresi — yalnız Süre ve Kullanım
  "server.modal.invite.duration.label": "Süre",
  "server.modal.invite.duration.7d": "7 gün",
  "server.modal.invite.uses.label": "Kullanım",
  "server.modal.invite.uses.unlimited": "Sınırsız",

  // §6.4 kanal bildirimleri
  "server.modal.notifications.all.title": "Tüm mesajlar",
  "server.modal.notifications.mentions.title": "Yalnızca bahsedilmeler",
  "server.modal.notifications.muted.title": "Sessiz",
  "server.modal.notifications.muteMobile": "Mobil bildirimleri de sustur",

  // §6.5 etkinlik penceresi
  "server.modal.event.name.placeholder": "Örn. Sürüm 2.4 canlı demo",
  "server.modal.event.channel.hint": "Etkinliğin gerçekleşeceği sunucu kanalı.",
  "server.modal.event.footer.required": "Ad, tarih ve saat alanları zorunlu.",
  "server.modal.event.submit": "Etkinlik oluştur",

  // §7 sunucu oluştur
  "server.create.title": "Sunucu oluştur",
  "server.create.description": "Sadece bir ad yeter. Kalan her şeyi sonradan değiştirebilirsin.",
  "server.create.icon.help":
    "Tek görsel, en fazla 4 MB. Yüklemezsen kısa adından renkli bir ikon üretilir.",
  "server.create.name.placeholder": "Örn. Whispr Topluluğu",
  "server.create.name.hint": "Üyelerin göreceği tam ad. 2–64 karakter.",
  "server.create.shortName.hint": "Rayda görünür",
  "server.create.description.placeholder": "Sunucunun ne için olduğunu tek cümleyle anlat.",
  "server.create.access.private.title": "Özel",
  "server.create.access.private.description": "Yalnızca davet bağlantısıyla katılınır.",
  "server.create.access.public.title": "Herkese açık",
  "server.create.access.public.description":
    "Bağlantıyı bilen herkes katılabilir, Keşfet'te listelenmez.",
  "server.create.access.discover.title": "Keşfet'te listelensin",
  "server.create.access.discover.description": "Herkese açık ve topluluk dizininde aranabilir.",
  "server.create.tags.leadActive":
    "Sunucunun Keşfet'te hangi aramalarda çıkacağını belirler. En fazla 5 etiket, her biri 24 karakter.",
  "server.create.toggles.memberAdds.title": "Üyeler kullanıcı ekleyebilir",
  "server.create.toggles.memberAdds.description":
    "Kapalıyken yalnızca admin ve sahipler davet gönderebilir.",
  "server.create.toggles.gifs.title": "GIF gönderimi",
  "server.create.toggles.uploads.title": "Dosya yükleme",
  "server.create.advanced.title": "Gelişmiş",
  "server.create.preview.emptyName": "Yeni sunucun",
  "server.create.preview.emptyDescription":
    "Açıklama eklersen üyeler sunucunun ne için olduğunu ilk bakışta anlar.",
  "server.create.preview.online": "1 çevrimiçi",
  "server.create.preview.members": "1 üye",
  "server.create.preview.summaryTitle": "Sunucuyu oluştur",
  "server.create.preview.summary.access": "Erişim",
  "server.create.preview.summary.invites": "Üye daveti",
  "server.create.preview.summary.media": "Medya",
  "server.create.preview.summary.messageLimit": "Mesaj limiti",
  "server.create.preview.invites.all": "Tüm üyeler",
  "server.create.preview.invites.admin": "Yalnızca admin",
  "server.create.preview.media.both": "GIF + dosya",
  "server.create.preview.media.gifs": "Yalnızca GIF",
  "server.create.preview.media.files": "Yalnızca dosya",
  // SPEC §7 yalnız adı sayıyor. Kısa ad o cümleden sonra **zorunlu ve tam üç karakter**
  // oldu (`workspace.ts` `serverShortNameWriteSchema`), ve ayak düğmesi ikisine birden
  // bakıyor; eksiği söylemeyen bir ipucu pasif düğmeyi açıklamaz olurdu.
  "server.create.footer.hint": "Devam etmek için sunucu adı ve 3 karakterli kısa ad gir.",
  "server.create.submit": "Sunucuyu oluştur",

  // §8 sol menü — dokuz bölüm, başlık ve üst açıklama tablosu
  "server.settings.title": "Sunucu ayarları",
  "server.settings.ownerOnly": "yalnızca sahip",
  "server.settings.saved": "Değişiklikler kaydedildi",
  "server.settings.section.general.title": "Genel",
  "server.settings.section.general.description": "Sunucu kimliği, ikonu ve açıklaması",
  "server.settings.section.visibility.title": "Görünürlük ve Keşfet",
  "server.settings.section.visibility.description":
    "Sunucuyu kimler bulabilir ve nasıl listelenir?",
  "server.settings.section.content.title": "İçerik ve Mesajlaşma",
  "server.settings.section.content.description": "Medya izinleri ve mesaj davranışı",
  "server.settings.section.channels.title": "Kanallar ve Kategoriler",
  "server.settings.section.channels.description": "Kategorileri ve kanalları düzenle, sırala, taşı",
  "server.settings.section.roles.title": "Roller ve Yetkiler",
  "server.settings.section.roles.description": "Rolleri düzenle, yetkileri grup grup ver",
  "server.settings.section.members.title": "Üyeler ve Moderasyon",
  "server.settings.section.members.description": "Üyeleri ara, rol ata, gerekirse çıkar",
  "server.settings.section.invites.title": "Davetler",
  "server.settings.section.invites.description": "Davet bağlantıları oluştur ve yönet",
  "server.settings.section.events.title": "Etkinlikler",
  "server.settings.section.events.description": "Yaklaşan ve iptal edilmiş etkinlikler",
  "server.settings.section.danger.title": "Tehlike bölgesi",
  "server.settings.section.danger.description": "Geri alınamayan işlemler. Yalnızca sunucu sahibi.",

  // §8.1 Genel
  "server.settings.general.iconHint":
    "PNG veya JPG · en az 256×256. Görsel yoksa kısaltma gösterilir.",
  "server.settings.general.nameLabel": "Sunucu adı",
  "server.settings.general.shortNameLabel": "Kısaltma",
  "server.settings.general.descriptionLabel": "Açıklama",
  "server.settings.general.previewLabel": "Sunucu profili",
  "server.settings.general.statMembers": "Üye",
  "server.settings.general.statChannels": "Kanal",
  "server.settings.general.statRoles": "Rol",
  "server.settings.general.statVisibility": "Görünürlük",
  "server.settings.general.previewNote":
    "Bu kart davet önizlemesinde ve Keşfet listelemesinde görünür.",

  // §8.2 Görünürlük ve Keşfet
  "server.settings.visibility.typeTitle": "Sunucu türü · {type}",
  "server.settings.visibility.typeChip": "Salt okunur",
  "server.settings.visibility.typeDescription": "Küçük ekip ve arkadaş grupları için.",
  "server.settings.visibility.publicTitle": "Herkese açık",
  "server.settings.visibility.publicDescription": "Bağlantıyı bilen herkes katılabilir.",
  "server.settings.visibility.discoverableTitle": "Keşfet'te listele",
  "server.settings.visibility.discoverableDescription":
    "Sunucu Keşfet'te seçilen etiketin kategorisinde listelenir.",
  "server.settings.visibility.discoverableRequiresPublic": "Önce sunucuyu herkese açık yap.",
  "server.discoveryTags.lead":
    "En fazla {count} etiket seçilebilir. Etiketler yalnızca Keşfet'te listelenen sunucularda kullanılır.",
  "server.discoveryTags.helper":
    "Bir öneriyi seçtiğinde sunucu Keşfet'te o kategorinin altında listelenir.",
  "server.discoveryTags.info":
    "Keşfet listelemesi açıldığında sunucu, seçilen etiketin kategorisinde gösterilecek.",
  "server.discoveryTags.placeholder": "Etiket yaz, Enter'a bas",
  "server.discoveryTags.suggested": "Önerilen etiketler",

  // §8.3 İçerik ve Mesajlaşma
  "server.settings.content.gifs.title": "GIF gönderimi",
  "server.settings.content.gifs.description": "Yazı kanallarında GIF arama ve gönderme.",
  "server.settings.content.files.title": "Dosya yükleme",
  "server.settings.content.files.description": "Görsel, ekran görüntüsü ve belge paylaşımı.",
  "server.settings.content.messageLimit.title": "Mesaj karakter limiti",
  "server.settings.content.deletedNotice.title": "Silinen mesaj bildirimi",
  "server.settings.content.deletedNotice.description":
    "Silinen mesajın yerinde bilgi notunun ne kadar kalacağını belirler.",
  "server.settings.content.slowMode.title": "Sunucu genelinde yavaş mod",
  "server.settings.content.slowMode.description":
    "Kanal bazlı yavaş moddan bağımsız çalışır; iki süre birlikte tanımlıysa uzun olan uygulanır.",

  // §8.4 Kanallar ve Kategoriler
  "server.settings.channels.addCategory": "Kategori ekle",
  "server.settings.channels.addChannel": "Kanal ekle",
  "server.settings.channels.note":
    "Kanalları sürükleyip kategoriler arasında taşı, sırayı değiştir.",
  "server.settings.channels.access.PUBLIC": "Herkese açık",
  "server.settings.channels.access.LOCKED_VISIBLE": "Kilitli",
  "server.settings.channels.access.PRIVATE": "Gizli",
  "server.settings.channels.access.ROLE_GATED": "Role bağlı",

  // §8.5 Roller ve Yetkiler — dört grup, 18 yetki
  "server.settings.roles.group.general": "Genel",
  "server.settings.roles.group.voice": "Ses ve Medya",
  "server.settings.roles.group.moderation": "Moderasyon",
  "server.settings.roles.group.management": "Yönetim",
  "server.settings.roles.preset.member": "Üye",
  "server.settings.roles.preset.moderator": "Moderatör",
  "server.settings.roles.preset.admin": "Admin",
  "server.settings.roles.permission.viewChannels": "Kanalları görüntüle",
  "server.settings.roles.permission.sendMessages": "Mesaj gönder",
  "server.settings.roles.permission.readHistory": "Geçmişi oku",
  "server.settings.roles.permission.embedLinks": "Bağlantı ekle",
  "server.settings.roles.permission.useEmoji": "Emoji kullan",
  "server.settings.roles.permission.connectVoice": "Sese bağlan",
  "server.settings.roles.permission.speak": "Konuş",
  "server.settings.roles.permission.useVideo": "Kamera aç",
  "server.settings.roles.permission.stream": "Ekran paylaş",
  "server.settings.roles.permission.attachFiles": "Dosya yükle",
  "server.settings.roles.permission.manageMessages": "Mesaj sil",
  "server.settings.roles.permission.kickMembers": "Üye çıkar",
  "server.settings.roles.permission.timeoutMembers": "Üye sustur",
  "server.settings.roles.permission.manageInvites": "Davetleri yönet",
  "server.settings.roles.permission.manageChannels": "Kanalları yönet",
  "server.settings.roles.permission.manageRoles": "Rolleri yönet",
  "server.settings.roles.permission.manageServer": "Sunucuyu yönet",
  "server.settings.roles.permission.administrator": "Yönetici",
  "server.settings.roles.nameLabel": "Rol adı",
  "server.settings.roles.namePlaceholder": "Örn. Yayın Ekibi",
  "server.settings.roles.colorLabel": "Renk",
  "server.settings.roles.mentionable.title": "Etiketlenebilir",
  "server.settings.roles.mentionable.description": "Üyeler bu rolü @ ile çağırabilir.",
  "server.settings.roles.createRole": "Rol oluştur",
  "server.settings.roles.draftBadge": "TASLAK",
  "server.settings.roles.newRoleName": "Yeni rol",
  "server.settings.roles.draft.hint": "Devam etmek için bir rol adı gir.",
  "server.settings.roles.draft.summary": "Rol, @everyone üstünde {count} yetkiyle oluşturulacak.",
  "server.settings.roles.delete.title": "Rolü sil",
  "server.settings.roles.delete.description": "Roldeki üyeler @everyone yetkilerine döner.",

  // §8.6 Üyeler ve Moderasyon
  "server.settings.members.search.placeholder": "Üye veya kullanıcı adı ara",
  "server.settings.members.counter": "{filtered} / {total} üye",
  "server.settings.members.filter.all": "Tümü",
  "server.settings.members.filter.member": "Üye",
  "server.settings.members.filter.moderator": "Moderatör",
  "server.settings.members.filter.admin": "Admin",
  "server.settings.members.filter.owner": "Sunucu Sahibi",
  "server.settings.members.filter.online": "Çevrimiçi",
  "server.settings.members.filter.offline": "Çevrimdışı",
  "server.settings.members.allowAdds.title": "Üyeler kullanıcı ekleyebilir",
  "server.settings.members.allowAdds.description":
    "Kapalıyken yalnızca admin ve sahip davet gönderebilir.",

  // §8.7 Davetler
  "server.settings.invites.field.channel": "Hedef kanal",
  "server.settings.invites.field.duration": "Süre",
  "server.settings.invites.field.uses": "Kullanım sınırı",
  "server.settings.invites.create": "Davet oluştur",
  "server.settings.invites.existing": "Mevcut davetler",
  "server.settings.invites.copy": "Kopyala",
  "server.settings.invites.revoke": "İptal et",
  "server.settings.invites.expiry.never": "Süresiz",

  // §8.8 Etkinlikler
  "server.settings.events.tab.upcoming": "Yaklaşan",
  "server.settings.events.tab.cancelled": "İptal edilen",
  "server.settings.events.create": "Etkinlik oluştur",
  "server.settings.events.edit": "Düzenle",
  "server.settings.events.cancel": "İptal et",
  "server.settings.events.empty.cancelled": "İptal edilen etkinlik yok",

  // §8.9 Tehlike bölgesi
  "server.settings.danger.transfer.title": "Sahipliği devret",
  "server.settings.danger.transfer.description":
    "Devir tamamlandığında sen Admin rolüne düşersin, sahiplik yetkileri seçtiğin üyeye geçer.",
  "server.settings.danger.transfer.label": "Yeni sahip",
  "server.settings.danger.transfer.ack":
    "Sahipliği devrettiğimde bu işlemin geri alınamayacağını anlıyorum.",
  "server.settings.danger.transfer.note.selectMember": "Devretmek için bir üye seç.",
  "server.settings.danger.transfer.note.acknowledge": "Devam etmek için onayı aç.",
  "server.settings.danger.transfer.note.ready": "Sahiplik {name} kullanıcısına geçecek.",
  "server.settings.danger.delete.title": "Sunucuyu sil",
  "server.settings.danger.delete.description":
    "Tüm kanallar, mesajlar, roller ve davetler kalıcı olarak silinir. Bu işlem geri alınamaz.",
  "server.settings.danger.delete.submit": "Sunucuyu kalıcı olarak sil",
};

/**
 * Ş11–Ş14 boyunca `server.settings.*` altına taşınan ve **silinen** eski ağaç. Sözlükte
 * durmaları "hangi metin canlı" sorusunu cevapsız bırakırdı (00 §7).
 */
const REMOVED_LEGACY_PREFIXES = ["serverSettings."] as const;

/**
 * Ş4/Ş8–Ş10 eski yüzeyleri yeniden çizince çağıranı kalmayan anahtarlar. Tek tek sayılıyor:
 * bir gün biri aynı adı yeniden açarsa liste onu da yakalar.
 */
const REMOVED_LEGACY_KEYS = [
  "shell.channelSidebar.searchLabel",
  "shell.channelSidebar.searchPlaceholder",
  "voice.sidebar.you",
  "workspace.modal.serverEditTitle",
  "workspace.modal.serverSaveError",
  "workspace.modal.saveChanges",
] as const;

/** K3 — ban · zaman aşımı · QR · hedefli davet · bekleyen davetler **uçtan uca** var. */
const FORBIDDEN_SUBSTRINGS = ["Yakında", "yakında", "sonraki fazda", "Coming soon"] as const;

const SRC_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/**
 * Taranan yüzeyler: paketin yazdığı/ağır düzenlediği dosyalar. `/servers/[serverId]/about`
 * (`components/servers/server-profile-card.tsx`) **kapsam dışıdır** — 00 §1 o rotayı ayrı
 * tutuyor ve dosya bu paketten önce de gömülü metin taşıyordu; raporda kayıtlı.
 */
const SCANNED_SURFACES = [
  "components/chat/server-channel-header.tsx",
  "components/chat/typing-indicator.tsx",
  "components/servers/modals",
  "components/servers/shared",
  "components/shell/server-settings",
  "components/shell/channel-item.tsx",
  "components/shell/channel-search-popover.tsx",
  "components/shell/channel-sidebar.tsx",
  "components/shell/connected-voice-strip.tsx",
  "components/shell/server-member-panel.tsx",
  "components/shell/server-menu.tsx",
  "components/shell/workspace-modals.tsx",
  "components/voice/server",
] as const;

const TURKISH_LETTERS = /[çğıöşüÇĞİÖŞÜ]/u;

function collectFiles(absolutePath: string): string[] {
  const stats = statSync(absolutePath);

  if (stats.isFile()) {
    return /\.tsx?$/u.test(absolutePath) && !/\.test\.tsx?$/u.test(absolutePath)
      ? [absolutePath]
      : [];
  }

  return readdirSync(absolutePath).flatMap((entry) => collectFiles(join(absolutePath, entry)));
}

/**
 * Yorumlar taranmaz. Bu paketin kodu **Türkçe yorumlanıyor** (00 §11 rapor kuralı da öyle);
 * yorumdaki Türkçe bir sızıntı değil, dosyanın dili. Aranan şey ekrana çıkan metin.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/^[ \t]*\/\/.*$/gmu, "");
}

describe("sunucu ekranı metin sözleşmesi — SPEC ile birebir", () => {
  it("SPEC'te verilen her cümle birebir aynı", () => {
    const drift = Object.entries(SPEC)
      .filter(([key, expected]) => TR[key] !== expected)
      .map(([key, expected]) => `${key}: "${TR[key] ?? "(eksik)"}" ≠ "${expected}"`);

    assert.deepEqual(drift, []);
  });

  it("sabit liste paketin dokuz bölümünü ve altı penceresini birden kapsar", () => {
    // Liste küçülürse denetim sessizce zayıflar; eşik SPEC'in bölüm sayısından türüyor.
    const prefixes = new Set(Object.keys(SPEC).map((key) => key.split(".").slice(0, 3).join(".")));

    assert.ok(Object.keys(SPEC).length >= 200, `sabit liste küçülmüş: ${Object.keys(SPEC).length}`);
    assert.ok(prefixes.size >= 20, `kapsam daralmış: ${prefixes.size} önek`);
  });
});

describe("kategori bırakma alanı", () => {
  it("yeni kategoride sürükleyip bırakma davranışını açıkça anlatır", () => {
    assert.equal(
      TR["shell.channelSidebar.dropChannelsHere"],
      "Kanalları buraya sürükleyip bırakabilirsin",
    );
    assert.equal(
      EN["shell.channelSidebar.dropChannelsHere"],
      "You can drag and drop channels here",
    );
  });
});

describe("sunucu ekranı metin sözleşmesi — iki dil", () => {
  it("her anahtarın İngilizce karşılığı var", () => {
    const missing = SERVER_KEYS.filter((key) => typeof EN[key] !== "string");

    assert.deepEqual(missing, []);
  });

  it("İngilizcede olup Türkçede olmayan `server.*` anahtarı yok", () => {
    const extra = Object.keys(EN).filter(
      (key) => key.startsWith("server.") && typeof TR[key] !== "string",
    );

    assert.deepEqual(extra, []);
  });

  it("hiçbir değer boş değil", () => {
    const empty = SERVER_KEYS.filter(
      (key) => TR[key]?.trim().length === 0 || EN[key]?.trim().length === 0,
    );

    assert.deepEqual(empty, []);
  });

  it("interpolasyon isimleri iki dilde aynı", () => {
    const placeholders = (value: string) =>
      [...value.matchAll(/\{(\w+)\}/gu)].map((match) => match[1]).sort();

    const drift = SERVER_KEYS.filter(
      (key) => placeholders(TR[key] ?? "").join("|") !== placeholders(EN[key] ?? "").join("|"),
    );

    assert.deepEqual(drift, []);
  });
});

describe("sunucu ekranı metin sözleşmesi — çoğul kuralları", () => {
  /**
   * §8 `5 üye`, §8.5 `14 yetki seçili`, §8.7 `3 / 25`. Türkçede tekil/çoğul aynı sözcüktür ama
   * `messages.test.ts` iki dilin anahtar kümesini birebir eşit tutuyor: İngilizce `_one`
   * biçimini istediği için Türkçe de aynı anahtarı taşır (Ş13 sapma 7).
   */
  const PLURAL_BASES = [
    "server.settings.memberCount",
    "server.settings.roles.memberCountLabel",
    "server.settings.roles.selectedCount",
    "server.settings.roles.draft.summary",
    "server.settings.channels.channelCountLabel",
    "server.settings.invites.summary.uses",
    "server.channel.userLimit.option",
  ] as const;

  it("sayaç anahtarlarının tekil biçimi iki dilde de kurulu", () => {
    const missing = PLURAL_BASES.filter(
      (base) => typeof TR[`${base}_one`] !== "string" || typeof EN[`${base}_one`] !== "string",
    );

    assert.deepEqual(missing, []);
  });

  it("her çoğul taban `{count}` taşır", () => {
    const withoutCount = PLURAL_BASES.filter((base) => !(TR[base] ?? "").includes("{count}"));

    assert.deepEqual(withoutCount, []);
  });

  it("SPEC'in üç sayaç cümlesi birebir", () => {
    assert.equal(TR["server.settings.memberCount"], "{count} üye");
    assert.equal(TR["server.settings.roles.selectedCount"], "{count} yetki seçili");
    // §8.7 `3 / 25` — sayaç iki parçadan kuruluyor, cümle değil biçim.
    assert.equal(TR["server.settings.members.counter"], "{filtered} / {total} üye");
  });
});

describe("sunucu ekranı metin sözleşmesi — artık kalmadı", () => {
  it("eski `serverSettings.*` ağacı iki dilde de silindi", () => {
    const leftovers = [...Object.keys(TR), ...Object.keys(EN)].filter((key) =>
      REMOVED_LEGACY_PREFIXES.some((prefix) => key.startsWith(prefix)),
    );

    assert.deepEqual(leftovers, []);
  });

  it("çağıranı kalmayan eski yüzey anahtarları silindi", () => {
    const leftovers = REMOVED_LEGACY_KEYS.filter(
      (key) => typeof TR[key] === "string" || typeof EN[key] === "string",
    );

    assert.deepEqual(leftovers, []);
  });

  it("hiçbir metin `Yakında` demiyor (K3)", () => {
    const offenders = SERVER_KEYS.filter((key) =>
      FORBIDDEN_SUBSTRINGS.some(
        (needle) => (TR[key] ?? "").includes(needle) || (EN[key] ?? "").includes(needle),
      ),
    );

    assert.deepEqual(offenders, []);
  });
});

describe("sunucu ekranı metin sözleşmesi — gömülü metin taraması", () => {
  it("paketin hiçbir yüzeyinde JSX'e gömülü Türkçe metin yok", () => {
    const offenders = SCANNED_SURFACES.flatMap((surface) =>
      collectFiles(join(SRC_ROOT, surface)).flatMap((file) => {
        const source = stripComments(readFileSync(file, "utf8"));
        const relativePath = relative(SRC_ROOT, file).split(sep).join("/");

        return source
          .split("\n")
          .map((line, index) => ({ index, line }))
          .filter(({ line }) => TURKISH_LETTERS.test(line))
          .map(({ index, line }) => `${relativePath}:${index + 1} ${line.trim()}`);
      }),
    );

    assert.deepEqual(offenders, []);
  });

  it("tarama gerçekten dosya okuyor", () => {
    // Kapsam yolu yanlış yazılırsa `collectFiles` boş döner ve üstteki test sahte yeşil verir.
    const scanned = SCANNED_SURFACES.flatMap((surface) => collectFiles(join(SRC_ROOT, surface)));

    assert.ok(scanned.length >= 30, `tarama kapsamı daralmış: ${scanned.length} dosya`);
  });
});
