"use client";

// The default import is what `node --test --import tsx` compiles JSX against in
// this package, the same as the other admin sections.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { BADGE_CATALOG, type BadgeId } from "@wizards/types";
import { Button } from "@wizards/ui";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { AdminAvatarSquare, AdminPill } from "@/components/admin/kit/admin-primitives";
import type { AdminPillTone } from "@/components/admin/kit/admin-primitives";
import {
  BADGE_LUCIDE_ICON,
  BADGE_TINT_VARIABLES,
  PROFILE_BADGE_CHIP_RADIUS,
  PROFILE_BADGE_CHIP_SIZE,
  PROFILE_BADGE_GLYPH_SIZE,
} from "@/components/shared/profile-badge-chips";
import type { AdminBadgeRow, AdminUserBadgesPayload } from "@/lib/badges/badge-admin-service";

/**
 * The badge half of the admin user surface (08 §3).
 *
 * Two rules decide the shape of this panel. The grant selector lists only
 * `layer: "granted"` badges, because everything else is a claim the evaluator
 * makes and an admin must not be able to fake; and when the session lacks
 * `badge.write` the form and the revoke controls are not rendered at all —
 * disabled controls would advertise an action the server would refuse anyway.
 */

const SOURCE_LABEL: Record<AdminBadgeRow["source"], string> = {
  AWARDED: "AWARDED",
  DERIVED: "DERIVED",
  GRANTED: "GRANTED",
};

const SOURCE_TONE: Record<AdminBadgeRow["source"], AdminPillTone> = {
  AWARDED: "success",
  DERIVED: "neutral",
  GRANTED: "primary",
};

export type AdminBadgeUser = {
  avatarUrl: string | null;
  displayName: string;
  email: string;
  id: string;
};

export type AdminBadgeGrantDraft = {
  badge: BadgeId | "";
  expiresAt: string;
  reason: string;
};

export const EMPTY_BADGE_GRANT_DRAFT: AdminBadgeGrantDraft = {
  badge: "",
  expiresAt: "",
  reason: "",
};

/**
 * Client-side mirror of the service's refusals (08 §2), so the form explains
 * itself before a round trip. The server repeats every one of these checks.
 */
export function getAdminBadgeGrantError(draft: AdminBadgeGrantDraft): string | null {
  if (!draft.badge) {
    return "Rozet seçin.";
  }

  if (BADGE_CATALOG[draft.badge].layer !== "granted") {
    return "Bu rozet kazanılır, elle verilemez.";
  }

  if (draft.badge === "event" && !draft.expiresAt.trim()) {
    return "Etkinlik rozetinde bitiş tarihi zorunludur.";
  }

  if (!draft.reason.trim()) {
    return "Neden zorunludur.";
  }

  return null;
}

export function getAdminBadgeRevokeError(reason: string) {
  return reason.trim() ? null : "Neden zorunludur.";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

export function getAdminBadgeName(id: BadgeId) {
  return BADGE_CATALOG[id].copy.tr.name;
}

/** "Erken üye · Kademe 2"; single-tier badges print no tier at all. */
export function getAdminBadgeTitle(row: Pick<AdminBadgeRow, "id" | "tier">) {
  const definition = BADGE_CATALOG[row.id];
  const name = definition.copy.tr.name;

  if (definition.thresholds.length <= 1 || row.tier <= 1) {
    return name;
  }

  return `${name} · ${definition.copy.tr.tiers?.[row.tier - 1] ?? `Kademe ${row.tier}`}`;
}

function BadgeGlyph({ id, muted }: { id: BadgeId; muted: boolean }) {
  const tint = BADGE_TINT_VARIABLES[BADGE_CATALOG[id].tint];
  const Icon = BADGE_LUCIDE_ICON[id];

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center border"
      style={{
        backgroundColor: tint.surface,
        borderColor: tint.border,
        borderRadius: PROFILE_BADGE_CHIP_RADIUS,
        height: PROFILE_BADGE_CHIP_SIZE,
        opacity: muted ? 0.45 : 1,
        width: PROFILE_BADGE_CHIP_SIZE,
      }}
    >
      <Icon
        aria-hidden
        color={tint.icon}
        height={PROFILE_BADGE_GLYPH_SIZE}
        width={PROFILE_BADGE_GLYPH_SIZE}
      />
    </span>
  );
}

function BadgeRowItem({
  muted,
  onRevoke,
  row,
}: {
  muted: boolean;
  onRevoke: ((row: AdminBadgeRow) => void) | null;
  row: AdminBadgeRow;
}) {
  return (
    <li className="app-panel-soft flex items-center gap-3 rounded-[12px] border p-3">
      <BadgeGlyph id={row.id} muted={muted} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p
            className={
              muted
                ? "text-app-muted truncate text-sm font-semibold"
                : "text-app-foreground truncate text-sm font-semibold"
            }
          >
            {getAdminBadgeTitle(row)}
          </p>
          <AdminPill tone={SOURCE_TONE[row.source]}>{SOURCE_LABEL[row.source]}</AdminPill>
          {row.expired ? <AdminPill tone="warning">Süresi doldu</AdminPill> : null}
          {row.revokedAt ? <AdminPill tone="danger">İptal edildi</AdminPill> : null}
        </div>
        <p className="text-app-soft mt-1 text-[11.5px]">
          Kazanıldı: {formatDateTime(row.earnedAt)}
          {row.expiresAt ? ` · Bitiş: ${formatDateTime(row.expiresAt)}` : ""}
        </p>
        {row.revokedAt ? (
          <p className="text-app-muted mt-1 text-[11.5px]">
            İptal: {formatDateTime(row.revokedAt)}
            {row.revokeReason ? ` · ${row.revokeReason}` : ""}
          </p>
        ) : null}
        {row.grantReason ? (
          <p className="text-app-muted mt-1 text-[11.5px]">Gerekçe: {row.grantReason}</p>
        ) : null}
      </div>
      {onRevoke ? (
        <button
          className="text-app-danger rounded-[10px] px-2 py-1 text-[12px] font-semibold hover:bg-[hsl(var(--danger)/0.12)]"
          onClick={() => onRevoke(row)}
          type="button"
        >
          İptal et
        </button>
      ) : null}
    </li>
  );
}

type PanelStep = { kind: "list" } | { kind: "revoke"; row: AdminBadgeRow };

type AdminUserBadgesProps = {
  canWrite: boolean;
  onClose: () => void;
  open: boolean;
  user: AdminBadgeUser | null;
};

async function requestAdminUserBadges(userId: string): Promise<AdminUserBadgesPayload> {
  const response = await fetch(`/api/v1/admin/users/${encodeURIComponent(userId)}/badges`);
  const body = (await response.json().catch(() => null)) as
    (AdminUserBadgesPayload & { error?: string }) | null;

  if (!response.ok || !body) {
    throw new Error(body?.error ?? "Rozetler yüklenemedi.");
  }

  return { active: body.active, grantable: body.grantable, inactive: body.inactive };
}

export function AdminUserBadges(props: AdminUserBadgesProps) {
  const panelKey = props.open ? (props.user?.id ?? "empty") : "closed";

  return <AdminUserBadgesContent {...props} key={panelKey} />;
}

function AdminUserBadgesContent({ canWrite, onClose, open, user }: AdminUserBadgesProps) {
  const [payload, setPayload] = useState<AdminUserBadgesPayload | null>(null);
  const [loading, setLoading] = useState(open && user !== null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<PanelStep>({ kind: "list" });
  const [draft, setDraft] = useState<AdminBadgeGrantDraft>(EMPTY_BADGE_GRANT_DRAFT);
  const [revokeReason, setRevokeReason] = useState("");
  const userId = user?.id ?? null;

  const load = useCallback(async () => {
    if (!userId) {
      return;
    }

    try {
      setPayload(await requestAdminUserBadges(userId));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Rozetler yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!open || !userId) {
      return;
    }

    let active = true;

    void requestAdminUserBadges(userId)
      .then((nextPayload) => {
        if (active) {
          setPayload(nextPayload);
        }
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(requestError instanceof Error ? requestError.message : "Rozetler yüklenemedi.");
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [open, userId]);

  const grantable = useMemo(() => payload?.grantable ?? [], [payload]);
  const grantError = getAdminBadgeGrantError(draft);

  async function submitGrant() {
    if (!userId || grantError) {
      setError(grantError);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/v1/admin/users/${encodeURIComponent(userId)}/badges`, {
        body: JSON.stringify({
          badge: draft.badge,
          ...(draft.badge === "event"
            ? { expiresAt: new Date(draft.expiresAt).toISOString() }
            : {}),
          reason: draft.reason.trim(),
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(body?.error ?? "Rozet verilemedi.");
      }

      setDraft(EMPTY_BADGE_GRANT_DRAFT);
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Rozet verilemedi.");
    } finally {
      setSaving(false);
    }
  }

  async function submitRevoke(row: AdminBadgeRow) {
    const reasonError = getAdminBadgeRevokeError(revokeReason);

    if (!userId || reasonError) {
      setError(reasonError);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/v1/admin/users/${encodeURIComponent(userId)}/badges`, {
        body: JSON.stringify({ badge: row.id, reason: revokeReason.trim() }),
        headers: { "Content-Type": "application/json" },
        method: "DELETE",
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(body?.error ?? "Rozet iptal edilemedi.");
      }

      setRevokeReason("");
      setStep({ kind: "list" });
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Rozet iptal edilemedi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      description={
        step.kind === "revoke"
          ? "İptal edilen rozet silinmez; kaydı nedeniyle birlikte durur."
          : "Yalnız GRANTED rozetler elle verilir. Her işlem denetim kaydına yazılır."
      }
      onClose={() => {
        if (!saving) {
          onClose();
        }
      }}
      open={open}
      title={step.kind === "revoke" ? "Rozeti iptal et" : "Rozetler"}
    >
      {user ? (
        <div className="space-y-4">
          <div className="app-panel-soft flex items-center gap-3 rounded-[12px] border p-3">
            <AdminAvatarSquare
              avatarUrl={user.avatarUrl}
              name={user.displayName}
              seed={user.id}
              size={36}
            />
            <div className="min-w-0">
              <p className="text-app-foreground truncate text-sm font-semibold">
                {user.displayName}
              </p>
              <p className="text-app-muted truncate text-xs">{user.email}</p>
            </div>
          </div>

          {step.kind === "revoke" ? (
            <div className="space-y-4">
              <ul className="space-y-2">
                <BadgeRowItem muted={false} onRevoke={null} row={step.row} />
              </ul>
              <label className="block">
                <span className="text-app-foreground mb-2 block text-sm font-semibold">Neden</span>
                <Textarea
                  disabled={saving}
                  maxLength={280}
                  onChange={(event) => setRevokeReason(event.target.value)}
                  placeholder="İptal nedenini yazın"
                  required
                  value={revokeReason}
                />
              </label>
              {error ? (
                <p aria-live="polite" className="text-app-danger text-sm">
                  {error}
                </p>
              ) : null}
              <div className="flex justify-end gap-3">
                <Button
                  disabled={saving}
                  onClick={() => {
                    setStep({ kind: "list" });
                    setError(null);
                  }}
                  type="button"
                  variant="outline"
                >
                  Vazgeç
                </Button>
                <Button
                  disabled={saving || Boolean(getAdminBadgeRevokeError(revokeReason))}
                  onClick={() => void submitRevoke(step.row)}
                  type="button"
                >
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  İptal et
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <section className="space-y-2">
                <h3 className="text-app-foreground text-sm font-semibold">Aktif rozetler</h3>
                {loading ? (
                  <p className="text-app-muted text-sm">Yükleniyor…</p>
                ) : payload && payload.active.length > 0 ? (
                  <ul className="space-y-2">
                    {payload.active.map((row) => (
                      <BadgeRowItem
                        key={row.id}
                        muted={false}
                        onRevoke={
                          canWrite
                            ? (target) => {
                                setStep({ kind: "revoke", row: target });
                                setRevokeReason("");
                                setError(null);
                              }
                            : null
                        }
                        row={row}
                      />
                    ))}
                  </ul>
                ) : (
                  <p className="text-app-muted text-sm">Bu hesapta aktif rozet yok.</p>
                )}
              </section>

              {payload && payload.inactive.length > 0 ? (
                <section className="space-y-2 opacity-70">
                  <h3 className="text-app-muted text-sm font-semibold">
                    İptal edilmiş ve süresi dolmuş rozetler
                  </h3>
                  <ul className="space-y-2">
                    {payload.inactive.map((row) => (
                      <BadgeRowItem key={row.id} muted onRevoke={null} row={row} />
                    ))}
                  </ul>
                </section>
              ) : null}

              {canWrite ? (
                <section className="space-y-3 border-t pt-4">
                  <h3 className="text-app-foreground text-sm font-semibold">Rozet ver</h3>
                  <label className="block">
                    <span className="text-app-foreground mb-2 block text-sm font-semibold">
                      Rozet
                    </span>
                    <select
                      aria-label="Rozet"
                      className="app-input h-11 w-full rounded-[12px] border px-3 text-sm outline-hidden"
                      disabled={saving}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          badge: event.target.value as BadgeId | "",
                        }))
                      }
                      value={draft.badge}
                    >
                      <option value="">Rozet seçin</option>
                      {grantable.map((id) => (
                        <option key={id} value={id}>
                          {getAdminBadgeName(id)}
                        </option>
                      ))}
                    </select>
                  </label>

                  {draft.badge === "event" ? (
                    <label className="block">
                      <span className="text-app-foreground mb-2 block text-sm font-semibold">
                        Bitiş tarihi
                      </span>
                      <input
                        className="app-input h-11 w-full rounded-[12px] border px-3 text-sm outline-hidden"
                        disabled={saving}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, expiresAt: event.target.value }))
                        }
                        required
                        type="datetime-local"
                        value={draft.expiresAt}
                      />
                    </label>
                  ) : null}

                  <label className="block">
                    <span className="text-app-foreground mb-2 block text-sm font-semibold">
                      Neden
                    </span>
                    <Textarea
                      disabled={saving}
                      maxLength={280}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, reason: event.target.value }))
                      }
                      placeholder="Rozetin verilme nedenini yazın"
                      required
                      value={draft.reason}
                    />
                  </label>

                  {error ? (
                    <p aria-live="polite" className="text-app-danger text-sm">
                      {error}
                    </p>
                  ) : null}

                  <div className="flex justify-end">
                    <Button
                      disabled={saving || Boolean(grantError)}
                      onClick={() => void submitGrant()}
                      type="button"
                    >
                      {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Rozet ver
                    </Button>
                  </div>
                </section>
              ) : error ? (
                <p aria-live="polite" className="text-app-danger text-sm">
                  {error}
                </p>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </Modal>
  );
}
