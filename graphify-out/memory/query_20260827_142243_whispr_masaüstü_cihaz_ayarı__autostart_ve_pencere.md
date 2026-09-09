---
type: "implementation"
date: "2026-08-27T14:22:43.059815+00:00"
question: "Whispr masaüstü cihaz ayarı, autostart ve pencere kapanış davranışı nasıl bağlanmalı?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["DesktopDeviceSettings", "DesktopWindowCloseAction", "desktop_control_set_app_settings", "is_desktop_autostart_enabled", "setup_tray", "DesktopNativeSettings"]
---

# Q: Whispr masaüstü cihaz ayarı, autostart ve pencere kapanış davranışı nasıl bağlanmalı?

## Answer

Sürümlü device-settings.json app_local_data_dir altında atomik yazılır; legacy native settings taşınır. OS autostart kaydı native plugin authority olarak kalır ve --autostart launchMode tepsiye gizli açılışı tetikler. Uzak web ayarları ayrıcalıklı IPC almak yerine trusted local Desktop Control app bölümüne yönlenir. Ayrı start-minimized satırı kaldırılır.

## Outcome

- Signal: useful

## Source Nodes

- DesktopDeviceSettings
- DesktopWindowCloseAction
- desktop_control_set_app_settings
- is_desktop_autostart_enabled
- setup_tray
- DesktopNativeSettings