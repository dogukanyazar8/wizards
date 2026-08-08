# Self-Hosted Local-Only CI Design

**Tarih:** 2026-08-08
**Durum:** Onaylandı; uygulama bekliyor

## Goal

GitHub Actions içinde GitHub-hosted runner kullanımını kaldırmak. Yalnız kayıtlı yerel Linux sanal makineleri kullanmak.

## Registered runners

- `wizards-ci-fast`: `[self-hosted, Linux, X64, ci-fast]`; hafif contract ve TypeScript işleri.
- `wizards-linux-local`: `[self-hosted, Linux, X64, wizards-ci, playwright, mobile-release]`; Docker, Playwright, release ve ağır CI işleri.

Windows veya macOS self-hosted runner kayıtlı değildir.

## Scope

- `ci.yml` içindeki GitHub-hosted Windows/macOS Node 22 ve desktop matris girdileri kaldırılır. Linux Desktop Ops yalnız `ci-fast` üzerinde kalır.
- `desktop-release.yml` Linux işlerini `[self-hosted, linux, x64, wizards-ci]` üzerinde çalıştırır. Windows artifact işi kaldırılır; Windows runner yokken eksik veya kuyruğa düşen release oluşturulmaz.
- `desktop-native-build.yml` yalnız Windows/macOS native build yaptığı için kaldırılır. Böylece PR, push ve manual dispatch üzerinde GitHub-hosted runner planlanmaz.
- Mobile Release ve Mobile Redesign Device Gate mevcut self-hosted yönlendirmelerini korur.
- Workflow contract testleri hiçbir `ubuntu-*`, `windows-latest` veya `macos-latest` runner hedefi kalmadığını; desteklenmeyen native işlerin tetiklenmediğini doğrular.

## Trade-off

Windows/macOS Tauri artifact, imza ve native doğrulama GitHub Actions'ta üretilmeyecek. Bu kanıt yeniden ancak uygun Windows/macOS self-hosted VM kaydedildiğinde geri eklenebilir. Linux CI, Playwright, Semgrep, mobil yayın ve Linux release süreçleri yerel VM'lerde sürer.

## Trust boundary

Kalıcı runner'lar `pull_request` kaynak kodunu çalıştırmaz. Mevcut push, schedule, tag ve manual-dispatch korumaları; minimum permissions, environment ve secret guard'ları korunur.

## Verification

- Workflow contract testleri test-first güncellenir.
- `pnpm.cmd actionlint` bütün workflow YAML'ını doğrular.
- İlgili toolchain testleri, `git diff --check` ve `graphify update .` çalıştırılır.
- Yerel kontroller GitHub Actions çalışması, Windows/macOS artifact üretimi veya release kabulü kanıtı değildir.
