import { createContext, useContext, type ReactNode } from "react";

/**
 * A message row opens its action menu on long press, but the row's press target
 * is the outermost `Pressable`. Anything inside it that takes its own press —
 * an image attachment card opening the lightbox — becomes the touch responder
 * and would otherwise swallow the long press with it. The row publishes its
 * long-press intent here so those inner targets can hand it back.
 */
const MessageRowLongPressContext = createContext<(() => void) | null>(null);

export function MessageRowLongPressProvider({
  children,
  onLongPress,
}: {
  readonly children: ReactNode;
  readonly onLongPress: () => void;
}) {
  return (
    <MessageRowLongPressContext.Provider value={onLongPress}>
      {children}
    </MessageRowLongPressContext.Provider>
  );
}

export function useMessageRowLongPress(): (() => void) | null {
  return useContext(MessageRowLongPressContext);
}
