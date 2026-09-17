# Ş5 — Go Live / Dalga 2

2026-09-17. Kaynak uygulandı; yerel testler geçti. Native WebView2/GPU kabulü açık. Alt ajan kullanılmadı.

## Uygulanan davranış

- Katalog 9'dan 106 başlığa çıktı; Rust algılama ve overlay whitelist aynı JSON'u okur. Launcher'lar hariç. Kayıtlı oyunlar cihazda en çok 64 kayıt; exe basename cihazda, ağa deterministik `custom:<sha256[:12]>` ve temizlenmiş etiket gider.
- Native komut yalnız ana pencereye açık; algılama kapalıysa süreç taramaz. Foreground oyun öncelikli; Whispr odaktayken çalışan oyun CTA olur. Başka uygulamaya odaklanmak oyunu kapandı saymaz.
- Voice bağlantısında 15 saniyelik aday sorgusu; süreç taraması native 15 saniyelik cache'i mevcut presence sorgusuyla paylaşır. İki ayrı çağıran korunur; ortak provider katmanı eklenmedi.
- Go Live tıklaması kullanıcı aktivasyonu içinde doğrudan `getDisplayMedia` açar. Pencere ipucu, mümkünse oyuna odak, oturumluk `motion`, mevcut çözünürlük/FPS/4K kapısı. Kullanıcının kalıcı mod tercihi değişmez.
- Gerçek capture yüzeyi pencereyse `game`; monitör/sekme ise `screen`. Yalnız `game` paylaşımında iki ardışık oyun-yok sonucu otomatik durdurur. Capture iptali mevcut paylaşım metadata'sını ezmez.
- Sunucu oyun kimliği/etiketini güncel hesap gizliliğiyle kırpar. Boolean Redis anahtarı `1` kalır; metadata ayrı 120 saniyelik TTL anahtarında, heartbeat ile yenilenir; çıkış/durdurma/yetki kaybında silinir. Roster okuması toplu `mget` ve tek ayar sorgusu kullanır.
- Kanal sidebar/sahne ve mobil DTO metadata taşır. DM başlatma CTA'sı bağlıdır; DM karşı tarafına oyun metadata taşıma için ayrı sunucu olayı eklenmedi. Kanal dışındaki uzak DM oyun başlığı ayrıca tamamlanmalıdır.
- Kayıtlı oyun ekleme/seçme, etiket düzenleme/kaydetme, kaldırma mevcut native ayar kaydını kullanır. Opt-in ipucu tek seferlik ve ayara bağlantılıdır.

## Doğrulama

- Rust `cargo test --lib --locked`: **61 PASS**; `cargo fmt --check`: PASS.
- Web/type paketleri typecheck: PASS. Odaklı Go Live/capture/polling ve gerçek yerel Redis üstünde kayıtlı-oyun etiket/gizlilik testleri: **13 PASS**. Voice service dahil önceki odaklı küme: **27 PASS**; kümeler örtüşür, toplanmaz.
- Chromium, üretim derlemesi + iki kullanıcı: **1 PASS** (7.9 saniye test, 14.9 saniye toplam). CTA `VALORANT`, Bob çipi, gizlilik kapalıyken oyun etiketinin gizlenmesi, oyun kapanınca otomatik durma doğrulandı. Sahte medya provider; native capture/GPU kanıtı değildir.
- İlk E2E denemesi testin PATCH isteklerinde `Origin` eksikliğiyle durdu. Mevcut `e2eRequestHeaders` kullanıldı; güvenlik koruması değiştirilmedi. Son koşu mevcut üretim build'ini yeniden kullandı; geçici Playwright config yalnız `pnpm start` çalıştırdı.
- Web tam testin önceki koşusu: 8756 PASS, 1 FAIL, 8 SKIP. FAIL paralel ayarlar çalışmasındaki `settings.account.banner.saving`, `settings.native.saved`, `settings.native.saving` kullanılmayan çeviri kontrolü; ekran paylaşımıyla ilgisiz, değiştirilmedi. Bu sayı son eklenen testlerle tam yeniden koşu değildir.
- Loglar `%TEMP%/wizards-wave2-go-live-final.log`, `wizards-wave2-go-live-e2e-final.log`, `wizards-wave2-web-test.log`, `wizards-wave2-rust.log`.

## Katalog kaynakları ve sınır

Kaynaklar: makinedeki Logitech G Hub `C:/Program Files/LGHUB/data/applications.json` içindeki oyun executable kayıtları; [açık süreç eşlemesi](https://raw.githubusercontent.com/phaticusthiccy/Telegram-Activity/master/games/process_mapping.json); [Larian](https://larian.com/support/faqs/the-launcher-is-blank-or-empty_99), [HoYoverse](https://support.hoyoverse.com/hc/en-us/articles/52306179394073-Resolving-Common-Honkai-Star-Rail-Error-Codes), [World of Tanks](https://worldoftanks.com/en/content/docs/release_notes/95-updatenotes/), [NTTGame](https://forum.nttgame.com/forum/tags.php?tag=knighonline), [Joygame](https://www.joygame.com/forum/wolfteam/konu/wolfteambin-hatasi-acil-yardim/94e93666-c928-4e58-824d-50d8c8fbdde1), [Point Blank PE incelemesi](https://www.manalyzer.org/report/e1b59b0ceee7d794e1dc78abdfdc54985644a3dc4ac6512aaba27dbcfeab432b), [Palworld süreç kaydı](https://steamcommunity.com/app/1623730/discussions/0/592888815005222597/).

Bu tablo kurulu her oyunda cihaz doğrulaması değildir. TFT/LoL, GTA Online/GTA V ve modern Call of Duty modları aynı exe'yi paylaşabilir; süreç adına dayanarak ayrı oyun modu vaat edilmez. Katalog dışı uygulamalar kayıtlı oyun akışından eklenebilir.

## Açık kabul

- Windows WebView2 sürümüyle seçici pencere ipucu, CaptureController odak dönüşü, exclusive fullscreen siyah-kare kontrolü.
- Gerçek Go Live dalında iki-peer kare alma ve donanım performansı. D0/D1'in 300 ms hedefi kapanmadı.
- Kayıtlı oyun ayarlarının native uçtan uca ekle/düzenle/kaldır kabulü.
- Uzak DM oyun metadata başlığı.

## Katalog anlık görüntüsü

| Oyun                             | Kimlik                          | Süreç basename                             |
| -------------------------------- | ------------------------------- | ------------------------------------------ |
| Counter-Strike 2                 | cs2                             | `cs2.exe`, `cs2`                           |
| VALORANT                         | valorant                        | `valorant-win64-shipping.exe`              |
| League of Legends                | league-of-legends               | `league of legends.exe`, `leagueoflegends` |
| Dota 2                           | dota-2                          | `dota2.exe`, `dota2`                       |
| Fortnite                         | fortnite                        | `fortniteclient-win64-shipping.exe`        |
| PUBG: BATTLEGROUNDS              | pubg                            | `tslgame.exe`                              |
| Minecraft                        | minecraft                       | `minecraft.windows.exe`, `minecraftpe`     |
| Grand Theft Auto V               | gta-v                           | `gta5.exe`, `gta5_enhanced.exe`            |
| Apex Legends                     | apex-legends                    | `r5apex.exe`, `r5apex_dx12.exe`            |
| War Thunder                      | war-thunder                     | `aces.exe`                                 |
| Detroit: Become Human            | detroit-become-human            | `detroitbecomehuman.exe`                   |
| Zula                             | zula                            | `zula.exe`                                 |
| Monster Hunter Wilds             | monster-hunter-wilds            | `monsterhunterwilds.exe`                   |
| PAYDAY 2                         | payday-2                        | `payday2_win32_release.exe`                |
| Forza Horizon 4                  | forza-horizon-4                 | `forzahorizon4.exe`                        |
| Civilization 7                   | civilization-7                  | `civ7_win64_dx12_finalrelease.exe`         |
| Dark Souls III                   | dark-souls-iii                  | `darksoulsiii.exe`                         |
| Resident Evil 4                  | resident-evil-4                 | `re4.exe`                                  |
| Resident Evil 7                  | resident-evil-7                 | `re7.exe`                                  |
| Resident Evil Village            | resident-evil-village           | `re8.exe`                                  |
| Borderlands 3                    | borderlands-3                   | `borderlands3.exe`                         |
| Sekiro: Shadows Die Twice        | sekiro-shadows-die-twice        | `sekiro.exe`                               |
| Cyberpunk 2077                   | cyberpunk-2077                  | `cyberpunk2077.exe`                        |
| Elden Ring                       | elden-ring                      | `eldenring.exe`                            |
| Monster Hunter: World            | monster-hunter-world            | `mhworld.exe`                              |
| Subnautica                       | subnautica                      | `subnautica.exe`                           |
| Hades                            | hades                           | `hades.exe`                                |
| Among Us                         | among-us                        | `amongus.exe`                              |
| Fall Guys                        | fall-guys                       | `fallguys_client.exe`                      |
| Overwatch 2                      | overwatch-2                     | `overwatch.exe`                            |
| Phasmophobia                     | phasmophobia                    | `phasmophobia.exe`                         |
| Tom Clancy's Rainbow Six Siege   | tom-clancy-s-rainbow-six-siege  | `rainbowsix.exe`                           |
| Rocket League                    | rocket-league                   | `rocketleague.exe`                         |
| Rust                             | rust                            | `rustclient.exe`                           |
| Hollow Knight                    | hollow-knight                   | `hollowknight.exe`                         |
| Terraria                         | terraria                        | `terraria.exe`                             |
| Stardew Valley                   | stardew-valley                  | `stardew valley.exe`, `stardewvalley.exe`  |
| Dead by Daylight                 | dead-by-daylight                | `deadbydaylight.exe`                       |
| Destiny 2                        | destiny-2                       | `destiny2.exe`                             |
| Path of Exile                    | path-of-exile                   | `pathofexile.exe`                          |
| No Man's Sky                     | no-man-s-sky                    | `nms.exe`                                  |
| The Forest                       | the-forest                      | `theforest.exe`                            |
| Portal 2                         | portal-2                        | `portal2.exe`                              |
| Civilization VI                  | civilization-vi                 | `civilizationvi.exe`                       |
| Marvel Rivals                    | marvel-rivals                   | `marvel-win64-shipping.exe`                |
| Counter-Strike: Global Offensive | counter-strike-global-offensive | `csgo.exe`                                 |
| Dying Light 2                    | dying-light-2                   | `dyinglight2.exe`                          |
| Hogwarts Legacy                  | hogwarts-legacy                 | `hogwartslegacy.exe`                       |
| Hollow Knight: Silksong          | hollow-knight-silksong          | `silksong.exe`                             |
| Euro Truck Simulator 2           | euro-truck-simulator-2          | `eurotrucks2.exe`                          |
| Roblox                           | roblox                          | `robloxplayerbeta.exe`                     |
| Hades 2                          | hades-2                         | `hades2.exe`                               |
| Lethal Company                   | lethal-company                  | `lethal company.exe`                       |
| THE FINALS                       | the-finals                      | `discovery.exe`                            |
| Team Fortress 2                  | team-fortress-2                 | `tf_win64.exe`                             |
| Sons of the Forest               | sons-of-the-forest              | `sonsoftheforest.exe`                      |
| Valheim                          | valheim                         | `valheim.exe`                              |
| Helldivers 2                     | helldivers-2                    | `helldivers2.exe`                          |
| Street Fighter 6                 | street-fighter-6                | `streetfighter6.exe`                       |
| Resident Evil 3                  | resident-evil-3                 | `re3.exe`                                  |
| Mortal Kombat 1                  | mortal-kombat-1                 | `mk12.exe`                                 |
| Mortal Kombat 11                 | mortal-kombat-11                | `mk11.exe`                                 |
| Mount & Blade: Warband           | mount-blade-warband             | `mb_warband.exe`                           |
| Left 4 Dead                      | left-4-dead                     | `left4dead.exe`                            |
| Mount & Blade II: Bannerlord     | mount-blade-ii-bannerlord       | `bannerlord.native.exe`                    |
| Monster Hunter Rise              | monster-hunter-rise             | `monsterhunterrise.exe`                    |
| Factorio                         | factorio                        | `factorio.exe`                             |
| Assetto Corsa Competizione       | assetto-corsa-competizione      | `acc.exe`                                  |
| World of Tanks Blitz             | world-of-tanks-blitz            | `wotblitz.exe`                             |
| Dark Souls Remastered            | dark-souls-remastered           | `darksoulsremastered.exe`                  |
| Age of Empires 3                 | age-of-empires-3                | `aoe3de_s.exe`                             |
| American Truck Simulator         | american-truck-simulator        | `amtrucks.exe`                             |
| Forza Horizon 5                  | forza-horizon-5                 | `forzahorizon5.exe`                        |
| Resident Evil 2                  | resident-evil-2                 | `re2.exe`                                  |
| Deadlock                         | deadlock                        | `deadlock.exe`                             |
| Battlefield 1                    | battlefield-1                   | `bf1.exe`                                  |
| Battlefield V                    | battlefield-v                   | `bfv.exe`                                  |
| Battlefield 2042                 | battlefield-2042                | `bf2042.exe`                               |
| Call of Duty                     | call-of-duty                    | `cod.exe`                                  |
| Diablo III                       | diablo-iii                      | `diablo iii.exe`                           |
| Diablo IV                        | diablo-iv                       | `diablo iv.exe`                            |
| DOOM Eternal                     | doom-eternal                    | `doometernalx64vk.exe`                     |
| Dragon Age: Inquisition          | dragon-age-inquisition          | `dragonageinquisition.exe`                 |
| EA SPORTS FC 26                  | ea-sports-fc-26                 | `ea sports fc 26.exe`                      |
| Escape From Tarkov               | escape-from-tarkov              | `escapefromtarkov.exe`                     |
| Genshin Impact                   | genshin-impact                  | `genshinimpact.exe`                        |
| Guild Wars 2                     | guild-wars-2                    | `gw2-64.exe`                               |
| Hearthstone                      | hearthstone                     | `hearthstone.exe`                          |
| It Takes Two                     | it-takes-two                    | `itakestwo.exe`                            |
| Star Wars Jedi: Fallen Order     | star-wars-jedi-fallen-order     | `starwarsjedifallenorder.exe`              |
| Sea of Thieves                   | sea-of-thieves                  | `sotgame.exe`                              |
| Split Fiction                    | split-fiction                   | `splitfiction.exe`                         |
| STAR WARS Jedi Survivor          | star-wars-jedi-survivor         | `jedisurvivor.exe`                         |
| The Sims 4                       | the-sims-4                      | `ts4_x64.exe`                              |
| Titanfall 2                      | titanfall-2                     | `titanfall2.exe`                           |
| Warframe                         | warframe                        | `warframe.x64.exe`                         |
| World of Warcraft                | world-of-warcraft               | `wow.exe`, `wow-64.exe`                    |
| Metin2                           | metin2                          | `metin2client.exe`                         |
| osu!                             | osu                             | `osu!.exe`, `osu.exe`                      |
| Knight Online                    | knight-online                   | `knightonline.exe`                         |
| Wolfteam                         | wolfteam                        | `wolfteam.bin`                             |
| Point Blank                      | point-blank                     | `pointblank.exe`                           |
| Palworld                         | palworld                        | `palworld-win64-shipping.exe`              |
| Baldur's Gate 3                  | baldurs-gate-3                  | `bg3.exe`, `bg3_dx11.exe`                  |
| Honkai: Star Rail                | honkai-star-rail                | `starrail.exe`                             |
| World of Tanks                   | world-of-tanks                  | `worldoftanks.exe`                         |
