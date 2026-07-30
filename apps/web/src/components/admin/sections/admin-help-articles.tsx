"use client";

import React, { useState } from "react";
import { BookOpen, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@wizards/ui";

import {
  AdminCard,
  AdminGridTable,
  AdminPageHeader,
  AdminPill,
} from "@/components/admin/kit/admin-primitives";
import type { listAdminHelpArticles } from "@/lib/help/admin-help-service";

type AdminHelpArticle = Awaited<ReturnType<typeof listAdminHelpArticles>>["articles"][number];

type EditorState = {
  bodyMarkdown: string;
  category: AdminHelpArticle["category"];
  id: string | null;
  position: string;
  published: boolean;
  readMinutes: string;
  slug: string;
  title: string;
  url: string;
};

function toEditorState(article?: AdminHelpArticle): EditorState {
  return {
    bodyMarkdown: article?.bodyMarkdown ?? "",
    category: article?.category ?? "ACCOUNT",
    id: article?.id ?? null,
    position: String(article?.position ?? 0),
    published: article?.publishedAt !== null && article?.publishedAt !== undefined,
    readMinutes: String(article?.readMinutes ?? 1),
    slug: article?.slug ?? "",
    title: article?.title ?? "",
    url: article?.url ?? "",
  };
}

function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(new Date(value))
    : "Taslak";
}

export function AdminHelpArticles({ articles }: { articles: AdminHelpArticle[] }) {
  const [editor, setEditor] = useState<EditorState>(() => toEditorState(articles[0]));
  const [busy, setBusy] = useState<"delete" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy("save");
    setError(null);

    const response = await fetch(
      editor.id ? `/api/v1/admin/help/articles/${editor.id}` : "/api/v1/admin/help/articles",
      {
        body: JSON.stringify({
          bodyMarkdown: editor.bodyMarkdown.trim() || null,
          category: editor.category,
          position: Number(editor.position),
          published: editor.published,
          readMinutes: Number(editor.readMinutes),
          slug: editor.slug.trim(),
          title: editor.title.trim(),
          url: editor.url.trim(),
        }),
        headers: { "Content-Type": "application/json" },
        method: editor.id ? "PATCH" : "POST",
      },
    );
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;

    if (!response.ok) {
      setError(payload?.error ?? "Makale kaydedilemedi.");
      setBusy(null);
      return;
    }

    window.location.reload();
  }

  async function removeArticle() {
    if (!editor.id || !window.confirm(`${editor.title} makalesini silmek istiyor musun?`)) {
      return;
    }

    setBusy("delete");
    setError(null);
    const response = await fetch(`/api/v1/admin/help/articles/${editor.id}`, {
      method: "DELETE",
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;

    if (!response.ok) {
      setError(payload?.error ?? "Makale silinemedi.");
      setBusy(null);
      return;
    }

    window.location.reload();
  }

  return (
    <section className="space-y-5">
      <AdminPageHeader
        actions={
          <Button onClick={() => setEditor(toEditorState())} type="button" variant="outline">
            <Plus className="mr-2 h-4 w-4" />
            Yeni makale
          </Button>
        }
        subtitle="Mobil yardım merkezi içeriği ve yayın durumu"
        title="Yardım Makaleleri"
      />

      {error ? (
        <p aria-live="polite" className="text-app-danger text-sm">
          {error}
        </p>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(380px,.8fr)]">
        <AdminCard>
          <AdminGridTable
            columns="1.8fr 1fr .8fr .8fr 1fr"
            emptyLabel="Henüz yardım makalesi yok."
            headers={["Makale", "Kategori", "Okuma süresi", "Görüntülenme", "Durum"]}
            rows={articles.map((article) => ({
              cells: [
                <button
                  className="min-w-0 text-left"
                  key="title"
                  onClick={() => setEditor(toEditorState(article))}
                  type="button"
                >
                  <span className="text-app-foreground block truncate font-semibold">
                    {article.title}
                  </span>
                  <span className="text-app-muted block truncate text-xs">/{article.slug}</span>
                </button>,
                <AdminPill key="category" tone="primary">
                  {article.category}
                </AdminPill>,
                <span key="minutes">{article.readMinutes} dk</span>,
                <span key="views">{article.viewCount}</span>,
                <div key="status">
                  <AdminPill tone={article.publishedAt ? "success" : "warning"}>
                    {article.publishedAt ? "Yayında" : "Taslak"}
                  </AdminPill>
                  <p className="text-app-muted mt-1 text-[10px]">
                    {formatDate(article.publishedAt)}
                  </p>
                </div>,
              ],
              id: article.id,
            }))}
          />
        </AdminCard>

        <AdminCard>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <BookOpen className="text-[hsl(var(--primary))] h-5 w-5" />
                <h2 className="text-app-foreground font-semibold">
                  {editor.id ? "Makaleyi düzenle" : "Yeni makale"}
                </h2>
              </div>
              <p className="text-app-muted mt-1 text-xs">
                Slug, URL ve gövde mobil istemcinin okuma davranışını belirler.
              </p>
            </div>
            {editor.id ? (
              <Button
                disabled={busy !== null}
                onClick={() => void removeArticle()}
                size="sm"
                type="button"
                variant="outline"
              >
                <Trash2 className="mr-1 h-4 w-4" />
                Sil
              </Button>
            ) : null}
          </div>

          <div className="grid gap-4">
            <label className="grid gap-1.5 text-sm">
              <span className="text-app-muted text-xs font-semibold">Başlık</span>
              <input
                className="app-input h-11 rounded-[12px] border px-3"
                maxLength={200}
                onChange={(event) => setEditor({ ...editor, title: event.target.value })}
                value={editor.title}
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-app-muted text-xs font-semibold">Slug</span>
              <input
                className="app-input h-11 rounded-[12px] border px-3"
                maxLength={120}
                onChange={(event) => setEditor({ ...editor, slug: event.target.value })}
                value={editor.slug}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm">
                <span className="text-app-muted text-xs font-semibold">Kategori</span>
                <select
                  className="app-input h-11 rounded-[12px] border px-3"
                  onChange={(event) =>
                    setEditor({
                      ...editor,
                      category: event.target.value as AdminHelpArticle["category"],
                    })
                  }
                  value={editor.category}
                >
                  <option value="ACCOUNT">Hesap</option>
                  <option value="CHAT">Sohbet</option>
                  <option value="MEDIA">Medya</option>
                  <option value="SERVER">Sunucu</option>
                </select>
              </label>
              <label className="grid gap-1.5 text-sm">
                <span className="text-app-muted text-xs font-semibold">Okuma süresi</span>
                <input
                  className="app-input h-11 rounded-[12px] border px-3"
                  min="1"
                  onChange={(event) => setEditor({ ...editor, readMinutes: event.target.value })}
                  type="number"
                  value={editor.readMinutes}
                />
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm">
                <span className="text-app-muted text-xs font-semibold">Sıra</span>
                <input
                  className="app-input h-11 rounded-[12px] border px-3"
                  min="0"
                  onChange={(event) => setEditor({ ...editor, position: event.target.value })}
                  type="number"
                  value={editor.position}
                />
              </label>
              <label className="flex items-center gap-3 self-end pb-3 text-sm">
                <input
                  checked={editor.published}
                  onChange={(event) => setEditor({ ...editor, published: event.target.checked })}
                  type="checkbox"
                />
                <span className="text-app-foreground font-semibold">Yayında</span>
              </label>
            </div>
            <label className="grid gap-1.5 text-sm">
              <span className="text-app-muted text-xs font-semibold">URL</span>
              <input
                className="app-input h-11 rounded-[12px] border px-3"
                onChange={(event) => setEditor({ ...editor, url: event.target.value })}
                type="url"
                value={editor.url}
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-app-muted text-xs font-semibold">Markdown gövdesi</span>
              <textarea
                className="app-input min-h-64 rounded-[12px] border p-3 font-mono text-xs"
                maxLength={200_000}
                onChange={(event) => setEditor({ ...editor, bodyMarkdown: event.target.value })}
                value={editor.bodyMarkdown}
              />
            </label>
            <Button disabled={busy !== null} onClick={() => void save()} type="button">
              {busy === "save" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Kaydet
            </Button>
          </div>
        </AdminCard>
      </div>
    </section>
  );
}
