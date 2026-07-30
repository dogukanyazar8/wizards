import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AdminHelpArticles } from "./admin-help-articles";
import { AdminReleaseEditor } from "./admin-release-editor";
import { AdminReleases } from "./admin-releases";
import { AdminSupportReports, getAllowedBugReportStatuses } from "./admin-support-reports";

const draftRelease = {
  changeCount: 2,
  channel: "UAT" as const,
  codename: "Kuzey",
  createdAt: "2026-07-30T09:00:00.000Z",
  id: "release-draft",
  publishedAt: null,
  releasedAt: "2026-07-30T09:00:00.000Z",
  updatedAt: "2026-07-30T09:00:00.000Z",
  version: "0.9.0",
};

const publishedRelease = {
  ...draftRelease,
  id: "release-live",
  publishedAt: "2026-07-30T10:00:00.000Z",
  version: "0.8.15",
};

describe("admin content management panels", () => {
  it("renders release status, creation controls and a publish action only for drafts", () => {
    const markup = renderToStaticMarkup(
      <AdminReleases releases={[draftRelease, publishedRelease]} />,
    );

    for (const label of ["Sürümler", "Yeni taslak", "0.9.0", "0.8.15", "Taslak", "Yayında"]) {
      assert.match(markup, new RegExp(label, "u"));
    }

    assert.equal((markup.match(/Yayınla/gu) ?? []).length, 1);
    assert.doesNotMatch(markup, /useRouter/u);
  });

  it("renders every release field, ordered change editor and the fixed-width mobile preview", () => {
    const markup = renderToStaticMarkup(
      <AdminReleaseEditor
        release={{
          ...draftRelease,
          buildNumber: 42,
          changes: [
            {
              detail: "Yeni deneyim",
              id: "change-1",
              position: 0,
              title: "Hakkında yenilendi",
              type: "NEW",
            },
          ],
          highlight: "Yeni Hakkında deneyimi",
          mandatory: false,
          sizeBytes: 48_200_000,
          summary: "Bu sürüm içerik yönetimini getiriyor.",
        }}
      />,
    );

    for (const label of [
      "Versiyon",
      "Kod adı",
      "Kanal",
      "Sürüm tarihi",
      "Build",
      "Boyut",
      "Zorunlu",
      "Özet",
      "Öne çıkan",
      "Değişiklik maddeleri",
      "Başlık",
      "Açıklama",
    ]) {
      assert.match(markup, new RegExp(label, "u"));
    }

    assert.match(markup, /width:358px/u);
    assert.equal((markup.match(/readonly=""/giu) ?? []).length, 2);
  });

  it("renders help article metadata and the full editor contract", () => {
    const markup = renderToStaticMarkup(
      <AdminHelpArticles
        articles={[
          {
            bodyMarkdown: "# Mikrofon",
            category: "MEDIA",
            createdAt: "2026-07-30T09:00:00.000Z",
            id: "article-1",
            position: 0,
            publishedAt: null,
            readMinutes: 3,
            slug: "mikrofon-calismiyor",
            title: "Mikrofon çalışmıyor",
            updatedAt: "2026-07-30T09:00:00.000Z",
            url: "https://whispr.app/help/mikrofon-calismiyor",
            viewCount: 12,
          },
        ]}
      />,
    );

    for (const label of [
      "Yardım Makaleleri",
      "Mikrofon çalışmıyor",
      "Okuma süresi",
      "Görüntülenme",
      "Markdown gövdesi",
      "Sıra",
    ]) {
      assert.match(markup, new RegExp(label, "u"));
    }
  });

  it("renders a privacy-safe support queue and the promised purge date", () => {
    const markup = renderToStaticMarkup(
      <AdminSupportReports
        reports={[
          {
            appVersion: "0.8.15",
            category: "VOICE",
            createdAt: "2026-07-30T09:00:00.000Z",
            id: "report-1",
            includesDeviceInfo: true,
            includesLogs: true,
            includesScreenshot: true,
            platform: "android",
            purgeAfter: "2026-10-28T09:00:00.000Z",
            status: "OPEN",
            ticket: "WSP-00001",
            user: { displayName: "Ada", id: "user-1", username: "ada" },
          },
        ]}
      />,
    );

    for (const label of ["Hata Raporları", "WSP-00001", "Ada", "Silinme tarihi"]) {
      assert.match(markup, new RegExp(label, "u"));
    }
    assert.doesNotMatch(markup, /logExcerpt|deviceInfo|secret-log/u);
  });

  it("keeps support status choices on the OPEN to TRIAGED to terminal path", () => {
    assert.deepEqual(getAllowedBugReportStatuses("OPEN"), ["TRIAGED"]);
    assert.deepEqual(getAllowedBugReportStatuses("TRIAGED"), ["RESOLVED", "DISCARDED"]);
    assert.deepEqual(getAllowedBugReportStatuses("RESOLVED"), []);
  });
});
