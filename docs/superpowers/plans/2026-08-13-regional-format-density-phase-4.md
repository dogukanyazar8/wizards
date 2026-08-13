# Faz 4 Bölgesel Biçim ve Yoğunluk Uygulama Planı

> Dayanak: `docs/superpowers/specs/2026-08-13-regional-format-density-phase-4-design.md`

## 1. Ortak sözleşme — TDD

**Dosyalar:**

- Oluştur: `packages/types/src/account-date-time.ts`
- Oluştur: `packages/types/src/account-date-time.test.ts`
- Değiştir: `packages/types/src/index.ts`

Önce DST, invalid zone/instant, date order, H12/H24, `AUTO`, zone listesi ve density minimum testlerini yaz. Kırmızı sonucu gözle. En küçük saf Intl adaptörünü geliştir; types test/typecheck çalıştır.

## 2. Web/Tauri runtime ve density — TDD

**Dosyalar:**

- Oluştur: `apps/web/src/components/providers/account-preference-provider.tsx`
- Oluştur: ilgili provider/runtime testi
- Değiştir: `apps/web/src/components/shell/wizards-shell.tsx`
- Değiştir: desteklenen mesaj/bildirim/oturum yüzeyleri ve global CSS

Provider aynı React Query ayar kaynağını kullanmalı; formatter ve density CSS değişkenlerini memoize etmeli. Önce provider/density/formatter sözleşme testi, sonra shell ve seçili yüzey bağlantıları.

## 3. Web/Tauri ayarlar UI — TDD

**Dosyalar:**

- Değiştir: `apps/web/src/components/settings/account-settings-surface.ts`
- Değiştir: `apps/web/src/components/settings/account-settings-surface.test.ts`
- Değiştir: `apps/web/src/components/settings/settings-panel.tsx`
- Değiştir: `apps/web/src/lib/locale/messages/{tr,en}.ts`

Önce Phase 4 kontrollerinin görünür ve preview-only olmadığını kanıtlayan testleri kırmızıya getir. Aranabilir/klavye erişilebilir saat dilimi, tarih/saat selectleri, deterministic örnekler, density seçenekleri ve preview ekle. Mevcut optimistic patch'i kullan.

## 4. Mobile runtime ve ayarlar UI — TDD

**Dosyalar:**

- Oluştur: `apps/mobile/src/app/providers/mobile-account-preference-provider.tsx`
- Oluştur/değiştir: provider ve hesap ekranı component testleri
- Değiştir: `apps/mobile/src/app/providers/mobile-app-providers.tsx`
- Değiştir: `apps/mobile/src/app/screens/mobile-account-settings-screen.tsx`
- Değiştir: `apps/mobile/src/app/screens/mobile-account-settings-screen.styles.ts`
- Değiştir: `apps/mobile/src/locale/mobile-copy.ts`

Önce provider, `AUTO` AppState yenileme, picker filtreleme, option sheet ve minimum touch-target testlerini kırmızıya getir. Sonra sanallaştırılmış tam ekran time-zone picker, format/density sheets ve merkezi density metriklerini ekle.

## 5. Doğrulama

- Odaklı ortak/web/mobile testlerini çalıştır.
- Types, web ve mobile typecheck; değişen dosyalarda lint/format kontrolü çalıştır.
- `graphify update .` çalıştır ve Phase 4 düğümlerini yeniden sorgula.
- `git status`/`git diff --check` ile yalnız Faz 4 kapsamını raporla; commit/push/deploy/migration yapma.
- Device ve gerçek görsel kabul çalıştırılmadıysa açıkça `NOT RUN` de.
