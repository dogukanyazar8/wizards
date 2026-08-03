---
type: "query"
date: "2026-08-03T06:41:57.210974+00:00"
question: "SQLCipher purge ACK timeout hangi testte ve neden oldu?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["WhisprPerformanceDevice.psm1", "10-sqlcipher.ps1", "Maestro flows"]
---

# Q: SQLCipher purge ACK timeout hangi testte ve neden oldu?

## Answer

Expanded from graph vocab: [sqlcipher, performance, device, purge, command, ack, marker, timeout, export, scenario, test]. Failure was 10-sqlcipher.ps1 smoke run before iteration 1. Host passes an ampersand-containing deep-link URL through adb shell without remote-shell quoting, so purge loses scope and targetId and emits no ACK. Maestro flows also use launchApp with default stopApp true, contaminating warm and cache scenarios with cold restarts.

## Outcome

- Signal: useful

## Source Nodes

- WhisprPerformanceDevice.psm1
- 10-sqlcipher.ps1
- Maestro flows