import { prisma } from "@wizards/db";
import { z } from "zod";

import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";
import {
  DEFAULT_DESKTOP_SHORTCUT_ASSIGNMENTS,
  sanitizeDesktopShortcutAssignments,
  type DesktopShortcutAssignments,
} from "@/lib/desktop/shortcuts";
import { runHomeRoute, type HomeRouteContext } from "@/lib/home/route-runner";

/**
 * Masaüstü kısayol atamaları — Ayarlar paketi Dalga 3 / Ş10, K7 · `SPEC_DEVIATIONS` #11.
 *
 * Kendi ucu, `users/me/settings` değil. O uç düzen genişliklerinden bildirim sayacına kadar
 * yirmi alan taşıyor ve dört şerit aynı anda üstünde çalışıyor; beş dizelik bir tercih paketi
 * için oraya bir alan daha sıkıştırmak, kısayolları o ucun her değişikliğine bağlamak olurdu.
 *
 * Gövde **atamalardan ibarettir**. Çakışma gönderilmez ve saklanmaz: o, kabuğun her açılışta
 * yaptığı gerçek kayıt denemesinin sonucudur (K7). İstemciden gelen bir "çakışıyor" bayrağı,
 * hiçbir şeyin doğrulamadığı bir iddiadır.
 *
 * Yanıt her zaman **beş eylemin tamamıdır**: eksik anahtar varsayılana düşer. Kısmi bir cevap,
 * ekranın hangi satırı çizmeyeceğine karar vermesini isterdi.
 */

const DesktopShortcutsRequestBodySchema = z.object({
  shortcuts: z.record(z.string(), z.unknown()),
});

export type DesktopShortcutsResponse = {
  shortcuts: DesktopShortcutAssignments;
};

export type DesktopShortcutsRouteDependencies = HomeRouteContext & {
  readAssignments: (userId: string) => Promise<unknown>;
  writeAssignments: (userId: string, assignments: DesktopShortcutAssignments) => Promise<void>;
};

async function readDesktopShortcutColumn(userId: string): Promise<unknown> {
  const settings = await prisma.userSettings.findUnique({
    select: { desktopShortcuts: true },
    where: { userId },
  });

  return settings?.desktopShortcuts ?? null;
}

async function writeDesktopShortcutColumn(
  userId: string,
  assignments: DesktopShortcutAssignments,
): Promise<void> {
  // `upsert`: ayarlar satırı hesabın ilk tercihine kadar açılmamış olabiliyor ve bir kısayol
  // ataması o satırı açmak için yeterli bir sebep.
  await prisma.userSettings.upsert({
    create: { desktopShortcuts: assignments, userId },
    select: { id: true },
    update: { desktopShortcuts: assignments },
    where: { userId },
  });
}

export const defaultDesktopShortcutsDependencies: DesktopShortcutsRouteDependencies = {
  authenticate: () => requireApiUserId(),
  enforceRateLimit: enforceApiRateLimit,
  readAssignments: readDesktopShortcutColumn,
  writeAssignments: writeDesktopShortcutColumn,
};

export function desktopShortcutsGetRoute(
  request?: Request,
  dependencies: DesktopShortcutsRouteDependencies = defaultDesktopShortcutsDependencies,
): Promise<Response> {
  return runHomeRoute(
    "settings:desktop-shortcuts",
    dependencies,
    async (userId): Promise<DesktopShortcutsResponse> => ({
      shortcuts: sanitizeDesktopShortcutAssignments(await dependencies.readAssignments(userId)),
    }),
    request,
  );
}

/**
 * Ortak koşucuya değil elle yazıldı: `route-contract.test.ts` her yazan rotanın gövdesini
 * `parseJsonBody` ile okuduğunu kanıtlıyor ve bir kapanışın içine verilen ayrıştırıcı
 * kanıtlanamaz.
 */
export async function desktopShortcutsPatchRoute(
  request: Request,
  dependencies: DesktopShortcutsRouteDependencies = defaultDesktopShortcutsDependencies,
): Promise<Response> {
  try {
    const userId = await dependencies.authenticate();
    await dependencies.enforceRateLimit(userId, "settings:desktop-shortcuts");

    const body = await parseJsonBody(request, DesktopShortcutsRequestBodySchema);
    // Doğrulama **burada** biter: geçersiz kombinasyon 400 vermez, varsayılana döner. Kabuk
    // kaydı yine de deneyecek ve gerçek cevabı o verecek; uç bir kısayolun bu makinede boşta
    // olup olmadığını bilemez.
    const assignments = sanitizeDesktopShortcutAssignments(body.shortcuts);

    await dependencies.writeAssignments(userId, assignments);

    return Response.json({ shortcuts: assignments } satisfies DesktopShortcutsResponse, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export { DEFAULT_DESKTOP_SHORTCUT_ASSIGNMENTS };
