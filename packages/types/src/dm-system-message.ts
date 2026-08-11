import { z } from "zod";

/**
 * Leaf module on purpose. `group-dm.ts` needs the enum and already imports
 * `socket.ts` for `DMConversationDTOSchema`; `socket.ts` needs it too for the
 * three system columns on `DMMessagePayload`. Defining it here breaks what would
 * otherwise be a cycle whose group-side schema would evaluate against an
 * uninitialised binding. Both modules re-export it, so callers keep importing
 * `DMSystemMessageTypeSchema` from `@wizards/types` unchanged.
 */
export const DMSystemMessageTypeSchema = z.enum([
  "GROUP_CREATED",
  "MEMBER_ADDED",
  "MEMBER_REMOVED",
  "MEMBER_LEFT",
  "NAME_CHANGED",
  "ICON_CHANGED",
  /**
   * K3 / C2. The one settings change that announces itself. `systemValue`
   * carries the new window (`OFF` | `H24` | `D7` | `D90`), so the reader builds
   * the sentence in their own locale like every other system row.
   */
  "DISAPPEARING_CHANGED",
]);

export type DMSystemMessageTypeValue = z.infer<typeof DMSystemMessageTypeSchema>;
