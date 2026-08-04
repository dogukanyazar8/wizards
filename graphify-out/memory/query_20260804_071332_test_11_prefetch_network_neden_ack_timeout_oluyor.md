---
type: "debugging"
date: "2026-08-04T07:13:32.219707+00:00"
question: "Test 11 prefetch-network neden ACK timeout oluyor ve tekrarlanabilir cihaz test süreci nasıl düzeltilir?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["WhisprPerformanceDevice.psm1", "MobilePerformanceAutomationProvider()", "prefetchMobileDMMessagesPage()", "dropMobileMessageStream()", "Maestro flows"]
---

# Q: Test 11 prefetch-network neden ACK timeout oluyor ve tekrarlanabilir cihaz test süreci nasıl düzeltilir?

## Answer

Test 10 aktif DM observer bıraktığı için test 11 temiz başlangıç yapmıyordu. removeQueries sonrası disk silme, in-flight sorgu iptalinin tamamlanmasını beklemiyor; doğrudan prefetch de ölçüm kaynağını kaydetmiyordu. Çözüm: senaryo öncesi app-shell hazırlığı, prefetch için DM aç-inbox'a dön-reset sırası, await cancelQueries, measured prefetch wrapper, doğru prefetch+network cohort ve partial exportta minimum-sample doğrulamasını atlama. 1533 mobil test, 57 hedef test, typecheck ve 12 React testi geçti; yeni APK ile cihaz smoke gerekir.

## Outcome

- Signal: useful

## Source Nodes

- WhisprPerformanceDevice.psm1
- MobilePerformanceAutomationProvider()
- prefetchMobileDMMessagesPage()
- dropMobileMessageStream()
- Maestro flows