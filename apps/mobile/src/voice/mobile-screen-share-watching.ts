export type MobileScreenShareWatch = {
  channelId: string;
  serverId: string;
  sharerUserId: string;
  watching: boolean;
};

/** Visible surfaces share the voice level ticker; this controller owns no timer. */
export function createMobileScreenShareWatching() {
  const visible = new Map<
    string,
    { target: Omit<MobileScreenShareWatch, "watching">; count: number; sentAt: number }
  >();
  let active = true;
  let emit: ((event: MobileScreenShareWatch) => void) | null = null;
  const tick = (now = Date.now(), force = false) => {
    if (!active || !emit) return;
    for (const item of visible.values()) {
      if (!force && now - item.sentAt < 60_000) continue;
      emit({ ...item.target, watching: true });
      item.sentAt = now;
    }
  };
  return {
    tick,
    setEmitter(next: typeof emit) {
      emit = next;
      tick(Date.now(), true);
    },
    setActive(next: boolean) {
      if (active === next) return;
      active = next;
      if (next) tick(Date.now(), true);
      else for (const item of visible.values()) emit?.({ ...item.target, watching: false });
    },
    watch(target: Omit<MobileScreenShareWatch, "watching">) {
      const key = `${target.channelId}:${target.sharerUserId}`;
      const existing = visible.get(key);
      if (existing) existing.count++;
      else {
        visible.set(key, { target, count: 1, sentAt: 0 });
        tick();
      }
      let disposed = false;
      return () => {
        if (disposed) return;
        disposed = true;
        const item = visible.get(key);
        if (!item || --item.count > 0) return;
        visible.delete(key);
        if (active) emit?.({ ...target, watching: false });
      };
    },
  };
}

export const mobileScreenShareWatching = createMobileScreenShareWatching();
