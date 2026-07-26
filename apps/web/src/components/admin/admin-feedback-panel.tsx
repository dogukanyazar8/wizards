"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, MessageSquareHeart, Plus, RefreshCcw, Search, X } from "lucide-react";
import {
  FeedbackRatingSchema,
  FeedbackStatusSchema,
  FeedbackTopicSchema,
  formatFeedbackPublicNumber,
  type AdminFeedbackDetail,
  type AdminFeedbackDetailResponse,
  type AdminFeedbackListItem,
  type AdminFeedbackListResponse,
  type AdminRoadmapItem,
  type AdminRoadmapItemResponse,
  type AdminRoadmapListResponse,
  type FeedbackStatus,
} from "@wizards/types";
import { Button } from "@wizards/ui";
import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useI18n } from "@/components/providers/locale-provider";
import { cn } from "@/lib/utils";

type AdminFeedbackPanelProps = {
  /** Read-only roles still see everything; only the controls disappear. */
  canManage: boolean;
};

const FEEDBACK_STATUSES = FeedbackStatusSchema.options;
const FEEDBACK_TOPICS = FeedbackTopicSchema.options;
const FEEDBACK_RATINGS = FeedbackRatingSchema.options;

const STATUS_MESSAGE_KEYS: Record<FeedbackStatus, string> = {
  IN_PROGRESS: "feedback.status.inProgress",
  PLANNED: "feedback.status.planned",
  REVIEWING: "feedback.status.reviewing",
  SHIPPED: "feedback.status.shipped",
};

/**
 * Handoff 4b chip colours, carried over so a status reads the same to the
 * person who set it and the person who reported it.
 */
function statusTone(status: FeedbackStatus) {
  switch (status) {
    case "IN_PROGRESS":
      return "bg-[hsl(var(--accent)/0.14)] text-app-accent";
    case "SHIPPED":
      return "bg-[hsl(var(--success)/0.14)] text-app-success";
    case "REVIEWING":
      return "bg-[hsl(var(--warning)/0.14)] text-app-warning";
    default:
      return "app-panel-soft text-app-muted";
  }
}

async function fetchJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
  });
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;

  if (!response.ok) {
    throw new Error(payload?.error ?? "Request failed");
  }

  return payload as T;
}

function StatusPill({ status }: { status: FeedbackStatus }) {
  const { t } = useI18n();

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        statusTone(status),
      )}
    >
      {t(STATUS_MESSAGE_KEYS[status])}
    </span>
  );
}

/**
 * The developer side of 4a/4b: every report, what it says, what the device
 * looked like, and the two levers that answer it — a status the reporter is
 * notified about, and a roadmap row their vote can attach to.
 *
 * Laid out to survive three widths on one implementation: the desktop table
 * collapses to stacked cards below `lg`, which is what makes the same screen
 * usable in the browser, in the desktop shell and on a phone.
 */
export function AdminFeedbackPanel({ canManage }: AdminFeedbackPanelProps) {
  const { locale, t } = useI18n();
  const [status, setStatus] = useState<"ALL" | FeedbackStatus>("ALL");
  const [topic, setTopic] = useState<string>("ALL");
  const [rating, setRating] = useState<string>("ALL");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<AdminFeedbackListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminFeedbackDetail | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [roadmap, setRoadmap] = useState<AdminRoadmapItem[]>([]);
  const [newRoadmapTitle, setNewRoadmapTitle] = useState("");
  const [roadmapBusy, setRoadmapBusy] = useState(false);

  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }),
    [locale],
  );
  const dayFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }),
    [locale],
  );

  const filterParams = useMemo(() => {
    const params = new URLSearchParams();
    if (status !== "ALL") {
      params.set("status", status);
    }
    if (topic !== "ALL") {
      params.set("topic", topic);
    }
    if (rating !== "ALL") {
      params.set("rating", rating);
    }
    if (query.trim()) {
      params.set("query", query.trim());
    }
    return params.toString();
  }, [query, rating, status, topic]);

  const loadFeedback = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const payload = await fetchJson<AdminFeedbackListResponse>(
        `/api/v1/admin/feedback${filterParams ? `?${filterParams}` : ""}`,
      );
      setItems(payload.items);
      setTotal(payload.total);
      setCursor(payload.nextCursor);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t("admin.feedback.empty"));
    } finally {
      setLoading(false);
    }
  }, [filterParams, t]);

  const loadRoadmap = useCallback(async () => {
    try {
      const payload = await fetchJson<AdminRoadmapListResponse>("/api/v1/admin/feedback/roadmap");
      setRoadmap(payload.items);
    } catch {
      setRoadmap([]);
    }
  }, []);

  useEffect(() => {
    // Debounced so typing a WSP number does not fire a request per keystroke.
    // The roadmap rides the same tick: the detail drawer's "link to" list has to
    // be there the moment a row is opened.
    const timeout = window.setTimeout(() => {
      void loadFeedback();
      void loadRoadmap();
    }, 220);

    return () => window.clearTimeout(timeout);
  }, [loadFeedback, loadRoadmap]);

  const loadMore = async () => {
    if (!cursor || loadingMore) {
      return;
    }

    setLoadingMore(true);
    try {
      const params = new URLSearchParams(filterParams);
      params.set("cursor", cursor);
      const payload = await fetchJson<AdminFeedbackListResponse>(
        `/api/v1/admin/feedback?${params.toString()}`,
      );
      setItems((current) => [...current, ...payload.items]);
      setCursor(payload.nextCursor);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : null);
    } finally {
      setLoadingMore(false);
    }
  };

  const openDetail = async (feedbackId: string) => {
    setDetailBusy(true);
    setError(null);
    try {
      const payload = await fetchJson<AdminFeedbackDetailResponse>(
        `/api/v1/admin/feedback/${encodeURIComponent(feedbackId)}`,
      );
      setDetail(payload.feedback);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : null);
    } finally {
      setDetailBusy(false);
    }
  };

  const patchDetail = async (body: Record<string, unknown>) => {
    if (!detail) {
      return;
    }

    setDetailBusy(true);
    try {
      const payload = await fetchJson<AdminFeedbackDetailResponse>(
        `/api/v1/admin/feedback/${encodeURIComponent(detail.id)}`,
        { body: JSON.stringify(body), method: "PATCH" },
      );
      setDetail(payload.feedback);
      // The row the admin came from has to agree with what they just did.
      setItems((current) =>
        current.map((item) =>
          item.id === payload.feedback.id
            ? {
                ...item,
                roadmapItemId: payload.feedback.roadmapItemId,
                status: payload.feedback.status,
              }
            : item,
        ),
      );
      await loadRoadmap();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : t("admin.feedback.detail.error"),
      );
    } finally {
      setDetailBusy(false);
    }
  };

  const createRoadmapItem = async () => {
    const title = newRoadmapTitle.trim();
    if (!title || roadmapBusy) {
      return;
    }

    setRoadmapBusy(true);
    try {
      const payload = await fetchJson<AdminRoadmapItemResponse>("/api/v1/admin/feedback/roadmap", {
        body: JSON.stringify({ title }),
        method: "POST",
      });
      setRoadmap((current) => [payload.item, ...current]);
      setNewRoadmapTitle("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : null);
    } finally {
      setRoadmapBusy(false);
    }
  };

  const updateRoadmapItem = async (item: AdminRoadmapItem, next: Partial<AdminRoadmapItem>) => {
    setRoadmapBusy(true);
    try {
      const payload = await fetchJson<AdminRoadmapItemResponse>(
        `/api/v1/admin/feedback/roadmap/${encodeURIComponent(item.id)}`,
        { body: JSON.stringify(next), method: "PATCH" },
      );
      setRoadmap((current) =>
        current.map((entry) => (entry.id === payload.item.id ? payload.item : entry)),
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : null);
    } finally {
      setRoadmapBusy(false);
    }
  };

  return (
    <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.7fr)]" id="feedback">
      <div className="app-panel min-w-0 rounded-[28px] border p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="app-panel-soft flex h-10 w-10 items-center justify-center rounded-2xl border">
              <MessageSquareHeart aria-hidden className="h-5 w-5 text-app-accent" />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-app-foreground">
                {t("admin.feedback.title")}
              </h2>
              <p className="text-app-muted text-sm">{t("admin.feedback.description")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-app-muted text-xs font-semibold">
              {t("admin.feedback.total", { count: String(total) })}
            </span>
            <Button
              aria-label={t("admin.feedback.title")}
              onClick={() => void loadFeedback()}
              size="sm"
              variant="outline"
            >
              <RefreshCcw aria-hidden className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <label className="relative block">
            <Search
              aria-hidden
              className="text-app-muted pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
            />
            <Input
              aria-label={t("admin.feedback.searchPlaceholder")}
              className="pl-9"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("admin.feedback.searchPlaceholder")}
              value={query}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <select
              aria-label={t("admin.feedback.column.status")}
              className="app-panel-soft h-10 min-w-[9rem] rounded-xl border px-3 text-sm text-app-foreground"
              onChange={(event) => setStatus(event.target.value as "ALL" | FeedbackStatus)}
              value={status}
            >
              <option value="ALL">{t("admin.feedback.filter.allStatuses")}</option>
              {FEEDBACK_STATUSES.map((option) => (
                <option key={option} value={option}>
                  {t(STATUS_MESSAGE_KEYS[option])}
                </option>
              ))}
            </select>
            <select
              aria-label={t("admin.feedback.column.topic")}
              className="app-panel-soft h-10 min-w-[9rem] rounded-xl border px-3 text-sm text-app-foreground"
              onChange={(event) => setTopic(event.target.value)}
              value={topic}
            >
              <option value="ALL">{t("admin.feedback.filter.allTopics")}</option>
              {FEEDBACK_TOPICS.map((option) => (
                <option key={option} value={option}>
                  {t(`admin.feedback.topic.${option}`)}
                </option>
              ))}
            </select>
            <select
              aria-label={t("admin.feedback.column.rating")}
              className="app-panel-soft h-10 min-w-[8rem] rounded-xl border px-3 text-sm text-app-foreground"
              onChange={(event) => setRating(event.target.value)}
              value={rating}
            >
              <option value="ALL">{t("admin.feedback.filter.allRatings")}</option>
              {FEEDBACK_RATINGS.map((option) => (
                <option key={option} value={option}>
                  {t(`admin.feedback.rating.${option}`)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error ? (
          <p className="text-app-danger mt-4 text-sm" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-5 space-y-3">
          {loading ? (
            <p className="text-app-muted text-sm">{t("admin.feedback.loading")}</p>
          ) : items.length === 0 ? (
            <p className="text-app-muted text-sm">{t("admin.feedback.empty")}</p>
          ) : (
            items.map((item) => (
              <button
                className="app-panel-soft grid w-full gap-3 rounded-2xl border p-4 text-left transition hover:border-[hsl(var(--accent)/0.4)] lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
                key={item.id}
                onClick={() => void openDetail(item.id)}
                type="button"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-app-accent">
                      {formatFeedbackPublicNumber(item.publicNumber)}
                    </span>
                    <span className="text-app-muted text-xs">
                      {t(`admin.feedback.topic.${item.topic}`)} ·{" "}
                      {t(`admin.feedback.rating.${item.rating}`)}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-app-foreground">{item.preview}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <Avatar
                      alt={item.user.displayName ?? item.user.username}
                      className="h-6 w-6"
                      fallback={item.user.username}
                      src={item.user.avatarUrl}
                    />
                    <span className="text-app-muted truncate text-xs">@{item.user.username}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 lg:flex-col lg:items-end">
                  <StatusPill status={item.status} />
                  <span className="text-app-muted text-xs">
                    {dateFormatter.format(new Date(item.createdAt))}
                  </span>
                </div>
              </button>
            ))
          )}

          {cursor ? (
            <Button
              className="w-full"
              disabled={loadingMore}
              onClick={() => void loadMore()}
              variant="outline"
            >
              {loadingMore ? (
                <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
              ) : (
                t("admin.feedback.loadMore")
              )}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="app-panel min-w-0 rounded-[28px] border p-5 sm:p-6">
        <h3 className="text-base font-semibold text-app-foreground">
          {t("admin.feedback.roadmap.title")}
        </h3>
        <p className="text-app-muted mt-1 text-sm">{t("admin.feedback.roadmap.description")}</p>

        {canManage ? (
          <div className="mt-4 flex gap-2">
            <Input
              aria-label={t("admin.feedback.roadmap.newTitle")}
              onChange={(event) => setNewRoadmapTitle(event.target.value)}
              placeholder={t("admin.feedback.roadmap.newTitle")}
              value={newRoadmapTitle}
            />
            <Button
              aria-label={t("admin.feedback.roadmap.create")}
              disabled={roadmapBusy || newRoadmapTitle.trim().length === 0}
              onClick={() => void createRoadmapItem()}
              size="sm"
            >
              <Plus aria-hidden className="h-4 w-4" />
            </Button>
          </div>
        ) : null}

        <div className="mt-4 space-y-3">
          {roadmap.length === 0 ? (
            <p className="text-app-muted text-sm">{t("admin.feedback.roadmap.empty")}</p>
          ) : (
            roadmap.map((item) => (
              <div className="app-panel-soft rounded-2xl border p-4" key={item.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 font-semibold text-app-foreground">{item.title}</p>
                  <StatusPill status={item.status} />
                </div>
                <div className="text-app-muted mt-2 flex flex-wrap gap-3 text-xs">
                  <span>
                    {t("admin.feedback.roadmap.votes", { count: String(item.voteCount) })}
                  </span>
                  <span>
                    {t("admin.feedback.roadmap.linkedFeedback", {
                      count: String(item.feedbackCount),
                    })}
                  </span>
                  {item.featured ? <span>{t("admin.feedback.roadmap.featured")}</span> : null}
                </div>
                {canManage ? (
                  <select
                    aria-label={`${item.title} — ${t("admin.feedback.detail.statusAction")}`}
                    className="app-panel mt-3 h-9 w-full rounded-xl border px-3 text-sm text-app-foreground"
                    disabled={roadmapBusy}
                    onChange={(event) =>
                      void updateRoadmapItem(item, {
                        status: event.target.value as FeedbackStatus,
                      })
                    }
                    value={item.status}
                  >
                    {FEEDBACK_STATUSES.map((option) => (
                      <option key={option} value={option}>
                        {t(STATUS_MESSAGE_KEYS[option])}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>

      <Modal
        onClose={() => setDetail(null)}
        open={detail !== null}
        title={detail ? formatFeedbackPublicNumber(detail.publicNumber) : ""}
      >
        {detail ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={detail.status} />
              <span className="text-app-muted text-xs">
                {t(`admin.feedback.topic.${detail.topic}`)} ·{" "}
                {t(`admin.feedback.rating.${detail.rating}`)} ·{" "}
                {dateFormatter.format(new Date(detail.createdAt))}
              </span>
            </div>

            <div>
              <p className="text-app-muted text-xs font-semibold uppercase">
                {t("admin.feedback.detail.user")}
              </p>
              <div className="mt-2 flex items-center gap-3">
                <Avatar
                  alt={detail.user.displayName ?? detail.user.username}
                  className="h-9 w-9"
                  fallback={detail.user.username}
                  src={detail.user.avatarUrl}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-app-foreground">
                    {detail.user.displayName ?? detail.user.username}
                  </p>
                  <p className="text-app-muted text-xs">
                    {t("admin.feedback.detail.userMeta", {
                      count: String(detail.user.feedbackCount),
                      date: dayFormatter.format(new Date(detail.user.registeredAt)),
                    })}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <p className="text-app-muted text-xs font-semibold uppercase">
                {t("admin.feedback.detail.message")}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-app-foreground">
                {detail.message}
              </p>
            </div>

            {detail.attachments.length > 0 ? (
              <div>
                <p className="text-app-muted text-xs font-semibold uppercase">
                  {t("admin.feedback.detail.screenshots")}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {detail.attachments.map((attachment) => (
                    <a
                      aria-label={t("admin.feedback.detail.screenshots")}
                      className="block h-20 w-20 overflow-hidden rounded-xl border bg-cover bg-center"
                      href={attachment.url}
                      key={attachment.id}
                      rel="noreferrer"
                      // A background, not an <img>: these are fixed-size thumbnails
                      // of CDN uploads that the image optimizer cannot serve, and
                      // the link is what opens the real thing.
                      style={{ backgroundImage: `url(${JSON.stringify(attachment.url)})` }}
                      target="_blank"
                    />
                  ))}
                </div>
              </div>
            ) : null}

            <div>
              <p className="text-app-muted text-xs font-semibold uppercase">
                {t("admin.feedback.detail.diagnostics")}
              </p>
              {detail.diagnostics ? (
                <pre className="app-panel-soft mt-2 max-h-52 overflow-auto rounded-xl border p-3 text-xs text-app-foreground">
                  {JSON.stringify(detail.diagnostics, null, 2)}
                </pre>
              ) : (
                <p className="text-app-muted mt-2 text-sm">
                  {t("admin.feedback.detail.noDiagnostics")}
                </p>
              )}
            </div>

            {canManage ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-app-muted text-xs font-semibold uppercase">
                    {t("admin.feedback.detail.statusAction")}
                  </span>
                  <select
                    className="app-panel-soft mt-2 h-10 w-full rounded-xl border px-3 text-sm text-app-foreground"
                    disabled={detailBusy}
                    onChange={(event) => void patchDetail({ status: event.target.value })}
                    value={detail.status}
                  >
                    {FEEDBACK_STATUSES.map((option) => (
                      <option key={option} value={option}>
                        {t(STATUS_MESSAGE_KEYS[option])}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-app-muted text-xs font-semibold uppercase">
                    {t("admin.feedback.detail.roadmapLink")}
                  </span>
                  <select
                    className="app-panel-soft mt-2 h-10 w-full rounded-xl border px-3 text-sm text-app-foreground"
                    disabled={detailBusy}
                    onChange={(event) =>
                      void patchDetail({ roadmapItemId: event.target.value || null })
                    }
                    value={detail.roadmapItemId ?? ""}
                  >
                    <option value="">{t("admin.feedback.detail.roadmapNone")}</option>
                    {roadmap.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}

            <div className="flex items-center justify-end gap-2">
              {detailBusy ? (
                <span className="text-app-muted text-xs">{t("admin.feedback.detail.saving")}</span>
              ) : null}
              <Button onClick={() => setDetail(null)} variant="outline">
                <X aria-hidden className="mr-1 h-4 w-4" />
                {t("admin.feedback.detail.close")}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </section>
  );
}
