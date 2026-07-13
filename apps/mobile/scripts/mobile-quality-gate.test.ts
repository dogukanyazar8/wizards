import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MOBILE_AUTOMATED_GATES,
  MOBILE_MANUAL_QA_CHECKS,
  MOBILE_QA_DEVICE_MATRIX,
  summarizeMobileQualityGate,
  validateMobileQualityGate,
  type MobileQualityArea,
} from "../src/quality/mobile-quality-gate";

const expectedAreas: MobileQualityArea[] = [
  "accessibility",
  "auth",
  "deep-link",
  "dm",
  "launch",
  "navigation",
  "permissions",
  "performance",
  "realtime",
  "release",
  "search",
  "store",
  "sync",
  "theme",
  "voice",
  "workspace",
];

describe("mobile quality gate", () => {
  it("keeps the manual QA checklist broad enough for a real mobile release", () => {
    const areas = new Set(MOBILE_MANUAL_QA_CHECKS.map((check) => check.area));

    for (const area of expectedAreas) {
      assert.equal(areas.has(area), true, `Missing mobile manual QA area: ${area}`);
    }

    assert.equal(
      MOBILE_MANUAL_QA_CHECKS.some((check) => check.risk === "critical"),
      true,
    );
  });

  it("covers Android, iOS, compact, and tablet targets", () => {
    const platforms = new Set(MOBILE_QA_DEVICE_MATRIX.map((target) => target.platform));
    const sizeClasses = new Set(MOBILE_QA_DEVICE_MATRIX.map((target) => target.sizeClass));

    assert.equal(platforms.has("android"), true);
    assert.equal(platforms.has("ios"), true);
    assert.equal(sizeClasses.has("compact"), true);
    assert.equal(sizeClasses.has("tablet"), true);
  });

  it("keeps automated gates scoped to the mobile package", () => {
    assert.equal(MOBILE_AUTOMATED_GATES.length >= 5, true);
    for (const gate of MOBILE_AUTOMATED_GATES) {
      assert.equal(
        gate.id.startsWith("mobile-maestro-") || gate.command.includes("@wizards/mobile"),
        true,
      );
    }
  });

  it("tracks the current native mobile product navigation language", () => {
    const navigationCheck = MOBILE_MANUAL_QA_CHECKS.find((check) => check.id === "tab-navigation");
    assert.ok(navigationCheck);
    assert.match(navigationCheck.label, /Home, DMs, Notifications, Calls, and Profile/);
    assert.doesNotMatch(navigationCheck.label, /Overview, Chat, Voice, and Settings/);

    const voiceCheck = MOBILE_MANUAL_QA_CHECKS.find(
      (check) => check.id === "voice-lifecycle-contract",
    );
    assert.ok(voiceCheck);
    assert.match(voiceCheck.label, /LiveKit join/i);
    assert.match(voiceCheck.label, /heartbeat cleanup/i);

    const accessibilityCheck = MOBILE_MANUAL_QA_CHECKS.find(
      (check) => check.id === "native-accessibility-touch-targets",
    );
    assert.ok(accessibilityCheck);
    assert.match(accessibilityCheck.label, /44px/);
    assert.match(accessibilityCheck.label, /accessibility labels/i);

    const inviteCheck = MOBILE_MANUAL_QA_CHECKS.find(
      (check) => check.id === "invite-link-contract",
    );
    assert.ok(inviteCheck);
    assert.match(inviteCheck.label, /Safe invite links/);
    assert.match(inviteCheck.label, /native create\/join and canonical share/i);

    const searchCheck = MOBILE_MANUAL_QA_CHECKS.find(
      (check) => check.id === "message-search-contract",
    );
    assert.ok(searchCheck);
    assert.match(searchCheck.label, /authenticated mobile endpoints/i);
    assert.match(searchCheck.label, /server-side permission checks/i);

    const searchUiCheck = MOBILE_MANUAL_QA_CHECKS.find((check) => check.id === "message-search-ui");
    assert.ok(searchUiCheck);
    assert.match(searchUiCheck.label, /bounded real results/i);
    assert.match(searchUiCheck.label, /selected conversation/i);

    const dedicatedChannelCheck = MOBILE_MANUAL_QA_CHECKS.find(
      (check) => check.id === "workspace-dedicated-channel-chat",
    );
    assert.ok(dedicatedChannelCheck);
    assert.match(dedicatedChannelCheck.label, /dedicated channel chat screen/i);
    assert.match(dedicatedChannelCheck.label, /safe-area/i);

    const themeCheck = MOBILE_MANUAL_QA_CHECKS.find(
      (check) => check.id === "theme-light-dark-system",
    );
    assert.ok(themeCheck);
    assert.equal(themeCheck.area, "theme");
    assert.match(themeCheck.label, /System, light, and dark/i);

    const darkModeGate = MOBILE_AUTOMATED_GATES.find(
      (gate) => gate.id === "mobile-maestro-dark-mode",
    );
    assert.ok(darkModeGate);
    assert.match(darkModeGate.command, /phase1-dark-mode\.yml/);
  });

  it("summarizes quality readiness without leaking sensitive strings", () => {
    const summary = summarizeMobileQualityGate();

    assert.equal(summary.platformCount, 2);
    assert.equal(summary.requiredAreas.length, expectedAreas.length);
    assert.deepEqual(validateMobileQualityGate(), []);
  });

  it("locks the Phase 4 management closure, documentation, and manual safety checks", () => {
    const phase4Gate = MOBILE_AUTOMATED_GATES.find(
      (gate) => gate.id === "mobile-maestro-phase4-server-management",
    );
    assert.ok(phase4Gate);
    assert.equal(phase4Gate.command, "maestro test ../../.maestro/phase4-server-management.yml");

    const manualIds = new Set(MOBILE_MANUAL_QA_CHECKS.map((check) => check.id));
    for (const id of [
      "server-management-authz-capabilities",
      "server-member-role-replacement",
      "server-member-kick-boundaries",
      "server-management-pagination-and-history",
      "server-management-destructive-and-theme",
    ]) {
      assert.equal(manualIds.has(id), true, `Missing Phase 4 manual check: ${id}`);
    }

    const requiredStatements = [
      "Bu çalışma, web'in tam rol CRUD'una (create/update/delete + izin matrisi) göre bilinçli bir daralmadır; tam web rol CRUD paritesi değildir.",
      "Rol CRUD + izin hiyerarşisi mobilde ertelendi.",
      "Mobil yalnızca mevcut rollerin atama/kaldırma yetkisini ve yetkili üyeyi sunucudan atma (kick) işlemini sunar; sunucunun rol hiyerarşisini veya yetki sınırlarını genişletmez. Rol atama/kaldırma ve kick uçlarında web'in “kim kimi atayabilir veya sunucudan atabilir?” authz kontrolü servis katmanında birebir korunur.",
    ];
    for (const file of ["MIGRATION_PHASE_4.md", "PHASE_5_HANDOFF.md"]) {
      const filePath = join(process.cwd(), file);
      assert.equal(existsSync(filePath), true, `${file} must exist`);
      const source = readFileSync(filePath, "utf8");
      for (const statement of requiredStatements) {
        assert.ok(source.includes(statement), `${file} must preserve the Phase 4 role scope`);
      }
      assert.match(source, /MobileMediaUpload/);
      assert.match(source, /Maestro|maestro/);
    }
  });

  it("locks the Phase 5 privacy, performance, voice, and offline closure", () => {
    const phase5Gate = MOBILE_AUTOMATED_GATES.find(
      (gate) => gate.id === "mobile-maestro-phase5-voice",
    );
    assert.ok(phase5Gate);
    assert.equal(phase5Gate.command, "maestro test ../../.maestro/phase5-voice-polish.yml");

    const manualIds = new Set(MOBILE_MANUAL_QA_CHECKS.map((check) => check.id));
    for (const id of [
      "app-switcher-privacy-shield",
      "voice-camera-device-noise",
      "offline-awareness-no-queue",
      "phase5-list-startup-performance",
      "phase5-voice-accessibility",
    ]) {
      assert.equal(manualIds.has(id), true, `Missing Phase 5 manual check: ${id}`);
    }

    const migrationPath = join(process.cwd(), "MIGRATION_PHASE_5.md");
    assert.equal(existsSync(migrationPath), true, "MIGRATION_PHASE_5.md must exist");
    const migration = readFileSync(migrationPath, "utf8");
    for (const statement of [
      "Rol CRUD + izin hiyerar",
      "channel/category reorder UI",
      "offline queue",
      "group video layout",
      "Phase 0-5",
      "onLoad",
    ]) {
      assert.ok(migration.includes(statement), `Missing Phase 5 migration statement: ${statement}`);
    }
  });
});
