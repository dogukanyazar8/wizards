---
type: "query"
date: "2026-08-27T13:45:32.789577+00:00"
question: "Whispr desktop global ve uygulama içi kısayol mimarisi çalışıyor mu?"
contributor: "graphify"
source_nodes: ["apps/web/src/lib/desktop/shortcuts.ts,apps/web/src/components/settings/sections/desktop/desktop-section.tsx,apps/web/src/components/desktop/desktop-experience.tsx,apps/web/src/components/providers/authenticated-app-providers.tsx,apps/desktop/src-tauri/src/lib.rs,apps/desktop/src-tauri/assets/desktop-control/app.js"]
---

# Q: Whispr desktop global ve uygulama içi kısayol mimarisi çalışıyor mu?

## Answer

Native Tauri global-shortcut zinciri mevcut; ancak ürün durumu güvenilir değil. Alt glifi tüm platformlarda Option simgesiyle gösteriliyor. Web varsayılanı Alt+Space Rust tarafından rezerve edilip reddediliyor. Ana Ayarlar sunucu atamalarını gösterirken Desktop Control yerel native ayarları kaydediyor; kaynaklar senkron değil. Ayarlar rotasında aktif ses yoksa DesktopExperience mount olmuyor ve native komut dinleyicisi bulunmuyor. Doğru yön: privileged yazımı local Desktop Control altında tut; native config tek cihaz kaynağı olsun; platforma uygun etiket ve gerçek key capture ekle; listener tüm authenticated desktop rotalarında mount olsun; önce mevcut beş eylemi düzelt, sonra typed uygulama içi shortcut kataloğu ve yardım görünümü ekle.

## Source Nodes

- apps/web/src/lib/desktop/shortcuts.ts,apps/web/src/components/settings/sections/desktop/desktop-section.tsx,apps/web/src/components/desktop/desktop-experience.tsx,apps/web/src/components/providers/authenticated-app-providers.tsx,apps/desktop/src-tauri/src/lib.rs,apps/desktop/src-tauri/assets/desktop-control/app.js