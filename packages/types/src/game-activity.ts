import { z } from "zod";
import catalog from "./game-catalog.json";

export const GameIdSchema = z.enum([
  "cs2",
  "valorant",
  "league-of-legends",
  "dota-2",
  "fortnite",
  "pubg",
  "minecraft",
  "gta-v",
  "apex-legends",
]);
export type GameId = z.infer<typeof GameIdSchema>;
export const GAME_CATALOG = catalog.map((game) => ({ ...game, id: GameIdSchema.parse(game.id) }));
export const GameSharingSettingsSchema = z.object({ enabled: z.boolean() }).strict();
export const GameActivityUpdateSchema = z
  .object({ gameId: GameIdSchema.nullable(), sessionId: z.string().uuid() })
  .strict();
export const GameActivitySchema = z
  .object({
    gameId: GameIdSchema,
    startedAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
  })
  .strict();
export const GameActivityResponseSchema = z
  .object({ activity: GameActivitySchema.nullable() })
  .strict();
export type GameActivity = z.infer<typeof GameActivitySchema>;
