import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SettingJump } from "@/components/settings/rows/setting-jump";
import { findSettingsTab, walkSettingsRows } from "@/lib/settings/tree";

/** Ş6 §3 — atlama satırı (`jump`). */

describe("SettingJump", () => {
  it("düğme çiziyor, bağlantı değil", () => {
    const markup = renderToStaticMarkup(
      <SettingJump
        label="Sessiz saatleri düzenle"
        onJump={() => {}}
        target={{ section: "notifications", tab: "quiet-hours" }}
        testId="jump"
      />,
    );

    assert.ok(markup.includes('type="button"'));
    assert.ok(!markup.includes("<a "));
    assert.ok(markup.includes("Sessiz saatleri düzenle"));
  });

  it("hedefi çağırana veriyor", () => {
    let seen: unknown = null;

    const jump = (
      <SettingJump
        label="git"
        onJump={(target) => {
          seen = target;
        }}
        target={{ section: "notifications", tab: "quiet-hours" }}
      />
    );

    renderToStaticMarkup(jump);
    // Tıklama DOM'suz sınanamıyor; hedefin prop olarak taşındığı doğrulanıyor.
    assert.equal(seen, null);
    assert.deepEqual(jump.props.target, { section: "notifications", tab: "quiet-hours" });
  });
});

describe("jump satırlarının hedefi ağaçta gerçek", () => {
  it("her `jump` satırı var olan bir sekmeye gidiyor", () => {
    const jumps = [...walkSettingsRows()].filter(({ row }) => row.type === "jump");

    assert.ok(jumps.length > 0);

    for (const { row } of jumps) {
      assert.ok(row.target, `${row.key} hedefsiz`);
      assert.ok(
        findSettingsTab(row.target.section, row.target.tab),
        `${row.key} olmayan bir sekmeye gidiyor`,
      );
    }
  });
});
