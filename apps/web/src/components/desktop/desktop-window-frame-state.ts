export type DesktopWindowFrameState = {
  fullscreen: boolean;
  maximized: boolean;
};

export function shouldUseSquareDesktopFrame({ fullscreen, maximized }: DesktopWindowFrameState) {
  return fullscreen || maximized;
}
