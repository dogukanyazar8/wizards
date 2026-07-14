import { createBottomSheetStyles } from "../src/app/components/kit/bottom-sheet.styles";
import { createDmScreenStyles } from "../src/app/screens/dm-screen.styles";
import { createNotificationsScreenStyles } from "../src/app/screens/notifications-screen.styles";
import { createSettingsScreenStyles } from "../src/app/screens/settings-screen.styles";
import { darkTheme } from "../src/design/themes";
import {
  DARK_SCREEN_SEMANTIC_ROLE_TARGETS,
  assertSemanticStyleTree,
} from "../scripts/mobile-redesign-semantic-role-gate";

describe("mobile redesign dark semantic role gate", () => {
  for (const [target, styles] of [
      [DARK_SCREEN_SEMANTIC_ROLE_TARGETS[0], createDmScreenStyles(darkTheme)],
      [DARK_SCREEN_SEMANTIC_ROLE_TARGETS[1], createNotificationsScreenStyles(darkTheme)],
      [DARK_SCREEN_SEMANTIC_ROLE_TARGETS[2], createSettingsScreenStyles(darkTheme)],
      [DARK_SCREEN_SEMANTIC_ROLE_TARGETS[3], createBottomSheetStyles(darkTheme)],
    ] as const) {
    it(`${target.anchor} resolves every color and concrete measure to a semantic role`, () => {
      assertSemanticStyleTree(target, styles, darkTheme);
    });
  }
});
