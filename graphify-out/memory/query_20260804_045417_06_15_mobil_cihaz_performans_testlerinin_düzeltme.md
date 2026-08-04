---
type: "implementation"
date: "2026-08-04T04:54:17.312931+00:00"
question: "06-15 mobil cihaz performans testlerinin düzeltme gereksinimi ve 15 tekrar çalıştırma hazırlığı"
contributor: "graphify"
outcome: "useful"
source_nodes: ["WhisprPerformanceDevice.psm1", "mobile-performance-device-scripts.test.ts"]
---

# Q: 06-15 mobil cihaz performans testlerinin düzeltme gereksinimi ve 15 tekrar çalıştırma hazırlığı

## Answer

Tüm script sözleşmeleri ve 15 tekrar dry-run geçti. Kanıtlanan tek kusur, uygulama yokken bazı Android pm path çağrılarının exit 1 verip açıklayıcı preflight hatasını atlamasıydı. Assert-WhisprDeviceReady, exit 0 veren pm list packages ile düzeltildi ve regresyon testi eklendi.

## Outcome

- Signal: useful

## Source Nodes

- WhisprPerformanceDevice.psm1
- mobile-performance-device-scripts.test.ts