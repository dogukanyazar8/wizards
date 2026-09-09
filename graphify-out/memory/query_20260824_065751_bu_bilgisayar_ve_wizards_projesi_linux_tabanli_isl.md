---
type: "query"
date: "2026-08-24T06:57:51.743612+00:00"
question: "Bu bilgisayar ve Wizards projesi Linux tabanli isletim sistemine gecince hangi donanim, surucu ve yazilim sorunlarini yasayabilir?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["desktop-linux-gtk3-rustsec-risk.md", "mobile/package.json", "desktop/package.json", "Whispr Windows geliştirme ve CI/CD onboarding rehberi"]
---

# Q: Bu bilgisayar ve Wizards projesi Linux tabanli isletim sistemine gecince hangi donanim, surucu ve yazilim sorunlarini yasayabilir?

## Answer

Linux gecisi gelistirme icin uygulanabilir, fakat bugun tam Windows terk edilmemeli. Kaynakla dogrulanan kritik riskler MT7927 WiFi icin kernel 7.2 gereksinimi, MT7927 Bluetooth firmware eksigi, PowerShell ve NTFS junction bagimli Git ve Android UAT akislari, NSIS-only Tauri paketi, Linux native Tauri kabul testi eksigi ve acik GTK3 glib unsound kaydidir. Ayrı NVMe uzerinde dual boot ve Ethernet ile asamali kabul onerilir.

## Outcome

- Signal: useful

## Source Nodes

- desktop-linux-gtk3-rustsec-risk.md
- mobile/package.json
- desktop/package.json
- Whispr Windows geliştirme ve CI/CD onboarding rehberi