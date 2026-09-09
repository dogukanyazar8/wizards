import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ReportAttachmentRow,
  ReportNotice,
  ReportNoticeAction,
  ReportToggle,
} from "./bug-report-parts";
import { BugReportScreenshotRow } from "./bug-report-screenshot-row";
import { BugReportSuccess } from "./bug-report-success";
import {
  ServerRailDownloadButton,
  ServerRailReportButton,
} from "@/components/shell/server-rail-support-buttons";
import type { BugReportScreenshotState } from "@/lib/support/bug-report-form-model";

/**
 * SPEC-INDIRME §0/§A.5/§A.7/§A.11 — pencerenin kendisi bir portal olduğu için
 * sunucuda hiç çizilmez; bu yüzden burada **yapraklar** doğrulanır. Kararların
 * testi `bug-report-form-model.test.ts`'te.
 */

function screenshotRow(state: BugReportScreenshotState, percent = 62) {
  return renderToStaticMarkup(
    <BugReportScreenshotRow
      actionLabel="eylem"
      boxTitle="kutu"
      checked={state !== "none"}
      disabled={false}
      onAction={() => undefined}
      onBoxClick={() => undefined}
      onToggle={() => undefined}
      percent={percent}
      state={state}
      subtitle={`alt-metin-${state}`}
      title="Ekran görüntüsü"
      toggleLabel="Ekran görüntüsü"
    />,
  );
}

describe("bug report screenshot row", () => {
  it("draws a dashed empty box with no progress bar", () => {
    const markup = screenshotRow("none");

    assert.match(markup, /data-state="none"/);
    assert.match(markup, /dashed/);
    assert.equal(markup.includes('role="progressbar"'), false);
  });

  it("draws the preview and offers an inline action when a shot is ready", () => {
    const markup = screenshotRow("ready");

    assert.match(markup, /data-state="ready"/);
    assert.match(markup, /repeating-linear-gradient/);
    assert.match(markup, /bug-report-screenshot-action/);
  });

  it("shows the percentage twice and a real progress bar while uploading", () => {
    const markup = screenshotRow("uploading", 62);

    assert.match(markup, /%62/);
    assert.match(markup, /role="progressbar"/);
    assert.match(markup, /aria-valuenow="62"/);
    assert.match(markup, /width:62%/);
    // Bir spinner tek başına yetmez; yükleniyorken satır içi eylem de çizilmez.
    assert.equal(markup.includes("bug-report-screenshot-action"), false);
  });

  it("turns the box and the subtitle danger when the upload failed", () => {
    const markup = screenshotRow("failed");

    assert.match(markup, /data-state="failed"/);
    assert.match(markup, /hsl\(var\(--danger\)/);
    assert.match(markup, /bug-report-screenshot-action/);
  });

  it("keeps the progress bar outside the ellipsis-clamped subtitle line", () => {
    const markup = screenshotRow("uploading");
    const subtitleIndex = markup.indexOf("alt-metin-uploading");
    const progressIndex = markup.indexOf('role="progressbar"');

    assert.ok(subtitleIndex > 0 && progressIndex > subtitleIndex);
    // Alt metin kırpılır, ilerleme çubuğu kırpılmaz.
    assert.match(markup.slice(subtitleIndex - 220, subtitleIndex), /text-overflow:ellipsis/);
  });
});

describe("bug report attachment parts", () => {
  it("exposes the toggle as a switch with its state", () => {
    const on = renderToStaticMarkup(
      <ReportToggle checked label="Sistem günlükleri" onChange={() => undefined} testId="logs" />,
    );
    const off = renderToStaticMarkup(
      <ReportToggle
        checked={false}
        label="Sistem günlükleri"
        onChange={() => undefined}
        testId="logs"
      />,
    );

    assert.match(on, /role="switch"/);
    assert.match(on, /aria-checked="true"/);
    assert.match(on, /aria-label="Sistem günlükleri"/);
    assert.match(off, /aria-checked="false"/);
  });

  it("clamps a long device line to one ellipsised row", () => {
    const markup = renderToStaticMarkup(
      <ReportAttachmentRow
        control={null}
        subtitle="Chrome 128 · macOS 14.5 · 2.4.1 (1187) · stable"
        testId="device"
        title="Cihaz ve sürüm bilgisi"
        withDivider
      />,
    );

    assert.match(markup, /white-space:nowrap/);
    assert.match(markup, /text-overflow:ellipsis/);
    assert.match(markup, /Chrome 128 · macOS 14\.5 · 2\.4\.1 \(1187\) · stable/);
  });

  it("gives the two notice tones their own surface and only submit a retry", () => {
    const danger = renderToStaticMarkup(
      <ReportNotice
        action={
          <ReportNoticeAction onClick={() => undefined} testId="retry">
            Tekrar dene
          </ReportNoticeAction>
        }
        testId="submit-error"
        tone="danger"
      >
        Rapor gönderilemedi.
      </ReportNotice>,
    );
    const warning = renderToStaticMarkup(
      <ReportNotice testId="offline" tone="warning">
        Bağlantı yok.
      </ReportNotice>,
    );

    assert.match(danger, /hsl\(var\(--danger\) \/ 0\.1\)/);
    assert.match(danger, /Tekrar dene/);
    assert.match(danger, /role="alert"/);
    assert.match(warning, /hsl\(var\(--warning\) \/ 0\.12\)/);
    assert.equal(warning.includes("Tekrar dene"), false);
  });
});

describe("bug report success screen", () => {
  it("shows the ticket with a copy action rather than a toast", () => {
    const markup = renderToStaticMarkup(
      <BugReportSuccess
        body="Ürün ekibi bu numarayla takip edecek."
        closeLabel="Kapat"
        copied={false}
        copiedLabel="Kopyalandı"
        copyLabel="Numarayı kopyala"
        onClose={() => undefined}
        onCopy={() => undefined}
        ticket="WSP-12345"
        title="Rapor alındı"
      />,
    );

    assert.match(markup, /WSP-12345/);
    assert.match(markup, /Numarayı kopyala/);
    assert.match(markup, /bug-report-success-close/);
  });

  it("switches the copy button to the success tone once copied", () => {
    const markup = renderToStaticMarkup(
      <BugReportSuccess
        body="body"
        closeLabel="Kapat"
        copied
        copiedLabel="Kopyalandı"
        copyLabel="Numarayı kopyala"
        onClose={() => undefined}
        onCopy={() => undefined}
        ticket="WSP-12345"
        title="Rapor alındı"
      />,
    );

    assert.match(markup, /Kopyalandı/);
    assert.match(markup, /hsl\(var\(--success\) \/ 0\.14\)/);
    assert.equal(markup.includes("Numarayı kopyala"), false);
  });
});

describe("server rail support buttons", () => {
  it("draws both buttons at 41px with their own tones and titles", () => {
    const download = renderToStaticMarkup(
      <ServerRailDownloadButton label="Uygulamayı indir" onClick={() => undefined} />,
    );
    const report = renderToStaticMarkup(
      <ServerRailReportButton label="Sorun bildir" onClick={() => undefined} />,
    );

    assert.match(download, /title="Uygulamayı indir"/);
    assert.match(download, /hsl\(var\(--success\) \/ 0\.2\)/);
    assert.match(download, /2\.5625rem/);
    assert.match(report, /title="Sorun bildir"/);
    assert.match(report, /hsl\(var\(--surface-tertiary\)\)/);
    assert.match(report, /2\.5625rem/);
  });

  it("labels both buttons for screen readers as well as pointers", () => {
    const report = renderToStaticMarkup(
      <ServerRailReportButton label="Sorun bildir" onClick={() => undefined} />,
    );

    assert.match(report, /aria-label="Sorun bildir"/);
    assert.match(report, /data-testid="server-rail-report-button"/);
  });
});
