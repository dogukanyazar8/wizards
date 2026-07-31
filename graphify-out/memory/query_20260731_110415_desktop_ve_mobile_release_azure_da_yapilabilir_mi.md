---
type: "query"
date: "2026-07-31T11:04:15.370061+00:00"
question: "desktop ve mobile release Azure da yapilabilir mi?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["Signing And Updates", "workflow", "release", "desktop", "mobile"]
---

# Q: desktop ve mobile release Azure da yapilabilir mi?

## Answer

Evet. Mevcut Azure calismasi PR, UAT ve nightly ile sinirli; release pipeline bilerek yok. Desktop Windows hosted runner ile imzalama ve R2 yayini, mobile Ubuntu hosted runner ile OTA imzalama R2 ve APK EAS yayini yapabilir. Azure protected environment approvals, same SHA release gate, Key Vault veya secret variable scope ve release secretlarini yalniz imzalama veya yayinlama adimlarina map etme gerekir. Once desktop, sonra mobile OTA, en son Android APK shadow run; GitHub release yollarini kanit bitene kadar koru.

## Outcome

- Signal: useful

## Source Nodes

- Signing And Updates
- workflow
- release
- desktop
- mobile