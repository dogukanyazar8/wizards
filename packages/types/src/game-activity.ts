import { z } from "zod";
import catalog from "./game-catalog.json" with { type: "json" };

export const CatalogGameIdSchema = z.enum(catalog.map((game) => game.id) as [string, ...string[]]);
export const GameIdSchema = z.union([
  CatalogGameIdSchema,
  z.string().regex(/^custom:[a-f0-9]{12}$/),
]);
export type GameId = z.infer<typeof GameIdSchema>;
export const GAME_CATALOG = catalog.map((game) => ({ ...game, id: GameIdSchema.parse(game.id) }));
export const GameSharingSettingsSchema = z.object({ enabled: z.boolean() }).strict();
export const GameActivityUpdateSchema = z
  .object({
    gameId: GameIdSchema.nullable(),
    sessionId: z.string().uuid(),
    label: z
      .string()
      .transform((value) =>
        value
          .replace(/[\p{Cc}\p{Cf}]/gu, "")
          .replace(/\s+/gu, " ")
          .trim(),
      )
      .pipe(z.string().min(1).max(64))
      .nullable()
      .optional(),
  })
  .strict()
  .refine((value) => !value.gameId?.startsWith("custom:") || Boolean(value.label), {
    message: "Registered games require a label.",
  });
export const GameActivitySchema = z
  .object({
    gameId: GameIdSchema,
    label: z.string().min(1).max(64).nullable().optional(),
    startedAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
  })
  .strict();
export const GameActivityResponseSchema = z
  .object({ activity: GameActivitySchema.nullable() })
  .strict();
export type GameActivity = z.infer<typeof GameActivitySchema>;
