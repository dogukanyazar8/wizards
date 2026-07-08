import type { ComponentProps } from "react";

import { DMComposer as LegacyDMComposer } from "../mobile-root-screens-legacy";

export type DMComposerProps = ComponentProps<typeof LegacyDMComposer>;

export function DMComposer(props: DMComposerProps) {
  return <LegacyDMComposer {...props} />;
}
