export const MOBILE_LINE_ICON_NAMES = [
  "activity",
  "alert-circle",
  "alert-triangle",
  "arrow-down-tray",
  "arrow-up",
  "arrow-up-tray",
  "audio-wave",
  "audit-log",
  "back-arrow",
  "bell",
  "bell-off",
  "block",
  "bolt",
  "bug",
  "calendar",
  "camera",
  "chat-bubble",
  "check",
  "chevron-down",
  "chevron-right",
  "clock",
  "close",
  "code",
  "copy",
  "dots-horizontal",
  "dots-vertical",
  "edit",
  "emoji",
  "external-link",
  "enter",
  "face-bad",
  "forward-arrow",
  "face-good",
  "face-great",
  "face-okay",
  "file",
  "globe",
  "flag",
  "flame",
  "flask",
  "grip",
  "hash",
  "headphones",
  "image",
  "info",
  "invite-user",
  "leave",
  "lightbulb",
  "link",
  "loader-arc",
  "log-out",
  "lock",
  "members",
  "mention",
  "device-mobile",
  "message-square",
  "mic",
  "mic-off",
  "minus-circle",
  "moon",
  "person-plus",
  "phone",
  "pin",
  "reply-arrow",
  "play-circle",
  "plus",
  "profile",
  "roadmap-community",
  "roadmap-feedback",
  "search",
  "send",
  "send-plane",
  "servers",
  "thread-start",
  "settings",
  "shield",
  "sparkle",
  "speaker",
  "pause-glyph",
  "play-glyph",
  "star",
  "tick-double",
  "tick-single",
  "trash",
  "video",
] as const;

export type MobileLineIconName = (typeof MOBILE_LINE_ICON_NAMES)[number];

export interface MobileLineIconPathDefinition {
  readonly d: string;
  readonly strokeWidth?: number;
  readonly type: "path";
}

export interface MobileLineIconCircleDefinition {
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  readonly strokeWidth?: number;
  readonly type: "circle";
}

export interface MobileLineIconRectDefinition {
  readonly height: number;
  readonly rx: number;
  readonly strokeWidth?: number;
  readonly type: "rect";
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

export type MobileLineIconChildDefinition =
  MobileLineIconCircleDefinition | MobileLineIconPathDefinition | MobileLineIconRectDefinition;

export interface MobileLineIconStrokeDefinition {
  readonly children: readonly MobileLineIconChildDefinition[];
  readonly defaultStrokeWidth: number;
  readonly mode: "stroke";
  readonly strokeLinecap?: "butt" | "round" | "square";
  readonly strokeLinejoin?: "bevel" | "miter" | "round";
}

export interface MobileLineIconFillDefinition {
  readonly children: readonly MobileLineIconPathDefinition[];
  readonly mode: "fill";
}

export type MobileLineIconDefinition =
  MobileLineIconFillDefinition | MobileLineIconStrokeDefinition;

export const MOBILE_LINE_ICON_DEFINITIONS = {
  "back-arrow": {
    mode: "stroke",
    defaultStrokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [{ type: "path", d: "M15 6l-6 6 6 6" }],
  },
  bell: {
    mode: "stroke",
    defaultStrokeWidth: 1.9,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [
      { type: "path", d: "M18 9.5a6 6 0 0 0-12 0c0 4.5-2 6-2 6h16s-2-1.5-2-6Z" },
      { type: "path", d: "M10.2 20a2 2 0 0 0 3.6 0" },
    ],
  },
  "chat-bubble": {
    mode: "stroke",
    defaultStrokeWidth: 1.9,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [{ type: "path", d: "M20 11.5a7 7 0 0 1-9.9 6.4L5 19.5l1.3-4.2A7 7 0 1 1 20 11.5Z" }],
  },
  check: {
    mode: "stroke",
    defaultStrokeWidth: 2.4,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [{ type: "path", d: "M5 12.5l4.5 4.5L19 7.5" }],
  },
  "chevron-down": {
    mode: "stroke",
    defaultStrokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [{ type: "path", d: "M6 9l6 6 6-6" }],
  },
  "chevron-right": {
    mode: "stroke",
    defaultStrokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [{ type: "path", d: "M9 6l6 6-6 6" }],
  },
  edit: {
    mode: "stroke",
    defaultStrokeWidth: 2,
    strokeLinecap: "round",
    children: [{ type: "path", d: "M16 4l4 4L8 20H4v-4z" }],
  },
  emoji: {
    mode: "stroke",
    defaultStrokeWidth: 1.8,
    strokeLinecap: "round",
    children: [
      { type: "circle", cx: 12, cy: 12, r: 8.5 },
      {
        type: "path",
        d: "M8.5 14c1 1.6 6 1.6 7 0M9.5 9.8h.01M14.5 9.8h.01",
        strokeWidth: 2.2,
      },
    ],
  },
  headphones: {
    mode: "stroke",
    defaultStrokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [
      { type: "path", d: "M4 13a8 8 0 0 1 16 0" },
      { type: "rect", x: 3, y: 13, width: 4.5, height: 7, rx: 2 },
      { type: "rect", x: 16.5, y: 13, width: 4.5, height: 7, rx: 2 },
    ],
  },
  "invite-user": {
    mode: "stroke",
    defaultStrokeWidth: 1.8,
    strokeLinecap: "round",
    children: [
      { type: "circle", cx: 12, cy: 7, r: 3.4 },
      { type: "path", d: "M5 20c1.2-3.6 12.8-3.6 14 0" },
      { type: "path", d: "M18 4v4M16 6h4", strokeWidth: 1.6 },
    ],
  },
  leave: {
    mode: "stroke",
    defaultStrokeWidth: 1.9,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [{ type: "path", d: "M4 14c5-4 11-4 16 0M4 14l2 3 3-2M20 14l-2 3-3-2" }],
  },
  // MSG-1g action menu. Each glyph is the handoff path, drawn at 17px on the
  // left of its row.
  "reply-arrow": {
    mode: "stroke",
    defaultStrokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [
      { type: "path", d: "M9 14L4 9l5-5" },
      { type: "path", d: "M4 9h10a6 6 0 0 1 6 6v4" },
    ],
  },
  "thread-start": {
    mode: "stroke",
    defaultStrokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [
      { type: "path", d: "M4 5h16M4 10h16M4 15h9" },
      { type: "path", d: "M16 15l3 3-3 3" },
    ],
  },
  "forward-arrow": {
    mode: "stroke",
    defaultStrokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [
      { type: "path", d: "M15 14l5-5-5-5" },
      { type: "path", d: "M20 9H10a6 6 0 0 0-6 6v4" },
    ],
  },
  copy: {
    mode: "stroke",
    defaultStrokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [
      { type: "rect", x: 9, y: 9, width: 11, height: 11, rx: 3 },
      { type: "path", d: "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" },
    ],
  },
  /** MSG-1g/1h composer send glyph — the handoff's own plane, not the fill one. */
  "send-plane": {
    mode: "stroke",
    defaultStrokeWidth: 2.1,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [{ type: "path", d: "M4.5 12l15.5-8-6 8 6 8z" }],
  },
  /** MSG-1e system event: the arrow entering (or, mirrored, leaving) the door. */
  enter: {
    mode: "stroke",
    defaultStrokeWidth: 2.2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [
      { type: "path", d: "M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" },
      { type: "path", d: "M10 8l4 4-4 4M14 12H4" },
    ],
  },
  /** MSG-1e channel glyph: two slanted uprights, two rules. */
  hash: {
    mode: "stroke",
    defaultStrokeWidth: 2.3,
    strokeLinecap: "round",
    children: [{ type: "path", d: "M5 9h14M4 15h14M10 4l-2 16M17 4l-2 16" }],
  },
  /** MSG-1e pinned strip. */
  pin: {
    mode: "stroke",
    defaultStrokeWidth: 2.1,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [{ type: "path", d: "M12 17v5M7.5 4h9l-1.4 7 2.4 2.5H6.5L9 11z" }],
  },
  mic: {
    mode: "stroke",
    defaultStrokeWidth: 1.8,
    strokeLinecap: "round",
    children: [
      { type: "rect", x: 9, y: 3.5, width: 6, height: 11, rx: 3 },
      { type: "path", d: "M6 12a6 6 0 0 0 12 0M12 18v3" },
    ],
  },
  "mic-off": {
    mode: "stroke",
    defaultStrokeWidth: 2.2,
    strokeLinecap: "round",
    children: [
      { type: "rect", x: 9, y: 3.5, width: 6, height: 11, rx: 3 },
      { type: "path", d: "M4 4l16 16" },
    ],
  },
  plus: {
    mode: "stroke",
    defaultStrokeWidth: 2,
    strokeLinecap: "round",
    children: [{ type: "path", d: "M12 5v14M5 12h14" }],
  },
  profile: {
    mode: "stroke",
    defaultStrokeWidth: 1.9,
    strokeLinecap: "round",
    children: [
      { type: "circle", cx: 12, cy: 8.5, r: 3.5 },
      { type: "path", d: "M5.5 19.5c1.2-3.9 11.8-3.9 13 0" },
    ],
  },
  search: {
    mode: "stroke",
    defaultStrokeWidth: 2,
    strokeLinecap: "round",
    children: [
      { type: "circle", cx: 11, cy: 11, r: 6 },
      { type: "path", d: "M15.8 15.8L20 20" },
    ],
  },
  send: {
    mode: "fill",
    children: [{ type: "path", d: "M3.5 11.5L21 4l-5.5 17-3.5-7z" }],
  },
  servers: {
    mode: "stroke",
    defaultStrokeWidth: 1.9,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [
      { type: "rect", x: 3.5, y: 3.5, width: 7, height: 7, rx: 2.3 },
      { type: "rect", x: 13.5, y: 3.5, width: 7, height: 7, rx: 2.3 },
      { type: "rect", x: 3.5, y: 13.5, width: 7, height: 7, rx: 2.3 },
      { type: "rect", x: 13.5, y: 13.5, width: 7, height: 7, rx: 2.3 },
    ],
  },
  speaker: {
    mode: "fill",
    children: [{ type: "path", d: "M4 10v4h4l5 4V6L8 10z" }],
  },
  "audit-log": {
    mode: "stroke",
    defaultStrokeWidth: 1.9,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [{ type: "path", d: "M4 6h16M4 12h16M4 18h10" }],
  },
  camera: {
    mode: "stroke",
    defaultStrokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [
      { type: "path", d: "M4 8h3l2-2.5h6L17 8h3v11H4z" },
      { type: "circle", cx: 12, cy: 13, r: 3 },
    ],
  },
  clock: {
    mode: "stroke",
    defaultStrokeWidth: 1.9,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [
      { type: "circle", cx: 12, cy: 12, r: 8.5 },
      { type: "path", d: "M12 7.5V12l3 2" },
    ],
  },
  "external-link": {
    mode: "stroke",
    defaultStrokeWidth: 1.9,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [
      {
        type: "path",
        d: "M13.5 10.5L21 3M16 3h5v5M10 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5",
      },
    ],
  },
  file: {
    mode: "stroke",
    defaultStrokeWidth: 1.9,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [
      { type: "path", d: "M13 3H6v18h12V8z" },
      { type: "path", d: "M13 3v5h5" },
    ],
  },
  grip: {
    mode: "stroke",
    defaultStrokeWidth: 2.4,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [{ type: "path", d: "M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01" }],
  },
  "log-out": {
    mode: "stroke",
    defaultStrokeWidth: 1.9,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [{ type: "path", d: "M9 4h7v16H9M13 12H4M7 9l-3 3 3 3" }],
  },
  lock: {
    mode: "stroke",
    defaultStrokeWidth: 1.9,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [
      { type: "rect", x: 5.5, y: 10, width: 13, height: 10, rx: 2 },
      { type: "path", d: "M8 10V7.5a4 4 0 0 1 8 0V10" },
    ],
  },
  members: {
    mode: "stroke",
    defaultStrokeWidth: 1.9,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [
      { type: "circle", cx: 9, cy: 8.5, r: 3.2 },
      {
        type: "path",
        d: "M3 20c1-3.5 11-3.5 12 0M16.5 5.7a3.2 3.2 0 0 1 0 5.6M18 14.5c2 .7 3 1.9 3.5 3.5",
      },
    ],
  },
  // 4c/4d roadmap tabs. Paths copied verbatim from the handoff SVGs.
  "roadmap-community": {
    mode: "stroke",
    defaultStrokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [
      { type: "circle", cx: 9, cy: 8, r: 3 },
      { type: "path", d: "M3.5 19c.6-2.8 2.7-4.2 5.5-4.2s4.9 1.4 5.5 4.2" },
      { type: "circle", cx: 17, cy: 9, r: 2.4 },
      { type: "path", d: "M16 14.6c2.4.2 4 1.5 4.5 3.9" },
    ],
  },
  "roadmap-feedback": {
    mode: "stroke",
    defaultStrokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [{ type: "path", d: "M4 4h16v12H8l-4 4z" }],
  },
  shield: {
    mode: "stroke",
    defaultStrokeWidth: 1.9,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [{ type: "path", d: "M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" }],
  },
  // 11b quick profile card (handoff 1a/1b/1d). Paths copied verbatim from the
  // handoff SVGs so the card matches the mock at the stroke level.
  block: {
    mode: "stroke",
    defaultStrokeWidth: 1.9,
    strokeLinecap: "round",
    children: [
      { type: "circle", cx: 12, cy: 12, r: 8.5 },
      { type: "path", d: "M6 18L18 6" },
    ],
  },
  bolt: {
    mode: "stroke",
    defaultStrokeWidth: 1.9,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [{ type: "path", d: "M13 2L4.5 13.5H11L9.5 22 19 10h-6.5z" }],
  },
  /** 6a header "⋯": three filled dots, r 1.9 at cx 5/12/19 — a round cap of
   *  that stroke width is the same disc without a second icon mode. */
  "dots-horizontal": {
    mode: "stroke",
    defaultStrokeWidth: 3.8,
    strokeLinecap: "round",
    children: [{ type: "path", d: "M5 12h.01M12 12h.01M19 12h.01" }],
  },
  "dots-vertical": {
    mode: "stroke",
    defaultStrokeWidth: 2.6,
    strokeLinecap: "round",
    children: [{ type: "path", d: "M12 5h.01M12 12h.01M12 19h.01" }],
  },
  /** 6d bottom bar "Bağlantı": the handoff's chain glyph, which the kit lacked. */
  link: {
    mode: "stroke",
    defaultStrokeWidth: 1.9,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [
      {
        type: "path",
        d: "M10.6 13.4a4 4 0 006.1.5l2.4-2.4a4 4 0 00-5.7-5.7l-1.4 1.4M13.4 10.6a4 4 0 00-6.1-.5l-2.4 2.4a4 4 0 005.7 5.7l1.4-1.4",
      },
    ],
  },
  flag: {
    mode: "stroke",
    defaultStrokeWidth: 1.9,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [{ type: "path", d: "M5 21V4h11l-2 4 2 4H5" }],
  },
  info: {
    mode: "stroke",
    defaultStrokeWidth: 2,
    strokeLinecap: "round",
    children: [
      { type: "circle", cx: 12, cy: 12, r: 8.5 },
      { type: "path", d: "M12 11v5M12 8h.01", strokeWidth: 2.4 },
    ],
  },
  "person-plus": {
    mode: "stroke",
    defaultStrokeWidth: 1.9,
    strokeLinecap: "round",
    children: [
      { type: "circle", cx: 9.5, cy: 8.5, r: 3.5 },
      { type: "path", d: "M3.5 19.5c1-3.6 11-3.6 12 0M18 8v6M15 11h6" },
    ],
  },
  phone: {
    mode: "stroke",
    defaultStrokeWidth: 1.9,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [
      {
        type: "path",
        d: "M6 3h3l1.5 4.5L8 9.5a12 12 0 0 0 6.5 6.5l2-2.5L21 15v3a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2Z",
      },
    ],
  },
  star: {
    mode: "stroke",
    defaultStrokeWidth: 1.9,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [
      {
        type: "path",
        d: "M12 3.5l2.5 5.2 5.7.7-4.2 3.9 1.1 5.6-5.1-2.8-5.1 2.8 1.1-5.6L3.8 9.4l5.7-.7z",
      },
    ],
  },
  video: {
    mode: "stroke",
    defaultStrokeWidth: 1.9,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [
      { type: "rect", x: 3, y: 7, width: 12, height: 10, rx: 3 },
      { type: "path", d: "M15 10.5l6-3v9l-6-3" },
    ],
  },
  // 11c full profile page (handoff 1c/1f). The page ran on Ionicons while the
  // card drew these strokes; these three close the last gaps so both surfaces
  // read from the same icon set.
  "alert-circle": {
    mode: "stroke",
    defaultStrokeWidth: 2,
    strokeLinecap: "round",
    children: [
      { type: "circle", cx: 12, cy: 12, r: 8.5 },
      { type: "path", d: "M12 7.5v5M12 16h.01", strokeWidth: 2.4 },
    ],
  },
  calendar: {
    mode: "stroke",
    defaultStrokeWidth: 1.9,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [
      { type: "rect", x: 3.5, y: 5, width: 17, height: 15, rx: 3 },
      { type: "path", d: "M8 3v4M16 3v4M3.5 10.5h17" },
    ],
  },
  // 2c status picker glyphs, so the sheet the card opens keeps the card's set.
  "minus-circle": {
    mode: "stroke",
    defaultStrokeWidth: 1.9,
    strokeLinecap: "round",
    children: [
      { type: "circle", cx: 12, cy: 12, r: 8.5 },
      { type: "path", d: "M8 12h8", strokeWidth: 2.2 },
    ],
  },
  moon: {
    mode: "stroke",
    defaultStrokeWidth: 1.9,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [{ type: "path", d: "M20 14.4A8.5 8.5 0 0 1 9.6 4 8.5 8.5 0 1 0 20 14.4Z" }],
  },
  close: {
    mode: "stroke",
    defaultStrokeWidth: 2.2,
    strokeLinecap: "round",
    children: [{ type: "path", d: "M6.5 6.5l11 11M17.5 6.5l-11 11" }],
  },
  "play-circle": {
    mode: "stroke",
    defaultStrokeWidth: 1.9,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [
      { type: "circle", cx: 12, cy: 12, r: 8.5 },
      { type: "path", d: "M10.3 8.6l6 3.4-6 3.4z" },
    ],
  },
  // Handoff 3b/3c toast glyphs. success/info/action reuse `check`, `info` and
  // `trash`; only the warning triangle and the loading arc are new shapes.
  "alert-triangle": {
    mode: "stroke",
    defaultStrokeWidth: 2.2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [
      { type: "path", d: "M12 4L2.5 20h19z" },
      { type: "path", d: "M12 10v4M12 17h.01", strokeWidth: 2.6 },
    ],
  },
  trash: {
    mode: "stroke",
    defaultStrokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [
      { type: "path", d: "M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6.5 7l1 13h9l1-13" },
    ],
  },
  /** §1.6: download affordance on the message file card. */
  "arrow-down-tray": {
    mode: "stroke",
    defaultStrokeWidth: 2.1,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [{ type: "path", d: "M12 4v11M7.5 11l4.5 4.5L16.5 11M5 20h14" }],
  },
  /**
   * 6c's "Paylaş" quick action, traced from the handoff: an arrow leaving an
   * open tray. Not `arrow-down-tray` flipped -- the tray in the handoff is open
   * at the top rather than a closed baseline.
   */
  "arrow-up-tray": {
    mode: "stroke",
    defaultStrokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [
      { type: "path", d: "M12 15V4M8.5 7.5L12 4l3.5 3.5" },
      { type: "path", d: "M5 15v3.5a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5V15" },
    ],
  },
  /**
   * §1.5 voice-message transport. Filled, not stroked: the handoff draws the
   * play control as a solid 13px triangle inside the round button.
   */
  "play-glyph": {
    mode: "fill",
    children: [{ type: "path", d: "M7 4.5l12 7.5-12 7.5z" }],
  },
  "pause-glyph": {
    mode: "fill",
    children: [{ type: "path", d: "M7.5 4.5h3.5v15H7.5zM13 4.5h3.5v15H13z" }],
  },
  /**
   * Messaging delivery receipts (handoff §1.8). Both paths are read straight
   * from the reference HTML; the single tick is the same first stroke, so "sent"
   * and "read" share one glyph geometry instead of two different check marks.
   */
  "tick-single": {
    mode: "stroke",
    defaultStrokeWidth: 2.6,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [{ type: "path", d: "M2 12.5l4.2 4.2L14 9" }],
  },
  "tick-double": {
    mode: "stroke",
    defaultStrokeWidth: 2.6,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [
      { type: "path", d: "M2 12.5l4.2 4.2L14 9" },
      { type: "path", d: "M10.6 15l2 1.7L20.6 9" },
    ],
  },
  /** Three-quarter arc; the toast spins the whole glyph rather than animating a dash. */
  "loader-arc": {
    mode: "stroke",
    defaultStrokeWidth: 2.4,
    strokeLinecap: "round",
    children: [{ type: "path", d: "M12 3.5a8.5 8.5 0 1 0 8.5 8.5" }],
  },
  // Handoff 4a/4b feedback glyphs.
  activity: {
    mode: "stroke",
    defaultStrokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [{ type: "path", d: "M22 12h-4l-3 8-6-16-3 8H2" }],
  },
  "arrow-up": {
    mode: "stroke",
    defaultStrokeWidth: 2.6,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [{ type: "path", d: "M12 19V5M6 11l6-6 6 6" }],
  },
  bug: {
    mode: "stroke",
    defaultStrokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [
      { type: "circle", cx: 12, cy: 13, r: 6 },
      { type: "path", d: "M9 3h6M12 7v-4M17.5 8.5L19 7" },
    ],
  },
  // Badge catalog glyphs (00-ortak-baglam §4). Same 24×24 stroke idiom as the
  // 11b card set above: one outline, 1.9 stroke, round caps, no fills.
  /** `streak` — the flame's outline with the inner tongue that reads at 14px. */
  flame: {
    mode: "stroke",
    defaultStrokeWidth: 1.9,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [
      {
        type: "path",
        d: "M12 2.8c.6 2.8 2.1 4 3.4 5.4A7.4 7.4 0 0 1 17.6 13a5.6 5.6 0 0 1-11.2 0c0-1.8.8-3.3 1.9-4.4.2 1.4.9 2.2 1.8 2.3-.3-3.1.3-6 1.9-8.1Z",
      },
    ],
  },
  /** `ideaShipped` — bulb over its two base rules. */
  lightbulb: {
    mode: "stroke",
    defaultStrokeWidth: 1.9,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [
      {
        type: "path",
        d: "M12 3a6 6 0 0 0-3.4 10.9c.6.5.9 1.2.9 2h5c0-.8.3-1.5.9-2A6 6 0 0 0 12 3Z",
      },
      { type: "path", d: "M9.5 19h5M10.3 21.3h3.4" },
    ],
  },
  /** `contributor` — `</>`: two chevrons around a leaning rule. */
  code: {
    mode: "stroke",
    defaultStrokeWidth: 1.9,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [{ type: "path", d: "M8.5 8L4.5 12l4 4M15.5 8l4 4-4 4M13.6 4.8l-3.2 14.4" }],
  },
  /** `betaTester` — erlenmeyer: neck, body, liquid line. */
  flask: {
    mode: "stroke",
    defaultStrokeWidth: 1.9,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [
      {
        type: "path",
        d: "M9.6 3v5.4l-4.7 8.7a2.6 2.6 0 0 0 2.3 3.8h9.6a2.6 2.6 0 0 0 2.3-3.8l-4.7-8.7V3",
      },
      { type: "path", d: "M8.4 3h7.2M7.2 15h9.6" },
    ],
  },
  /** `event` — four-pointed star with the small companion the handoff draws. */
  sparkle: {
    mode: "stroke",
    defaultStrokeWidth: 1.9,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [
      { type: "path", d: "M10.2 3l2.1 5.1 5.1 2.1-5.1 2.1-2.1 5.1-2.1-5.1L3 10.2l5.1-2.1z" },
      { type: "path", d: "M17.6 15l1 2.4 2.4 1-2.4 1-1 2.4-1-2.4-2.4-1 2.4-1z" },
    ],
  },
  image: {
    mode: "stroke",
    defaultStrokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [
      { type: "rect", x: 3, y: 5, width: 18, height: 14, rx: 3 },
      { type: "circle", cx: 9, cy: 10, r: 1.8 },
      { type: "path", d: "M4 17l5-4 3 2 4-3 4 3.5" },
    ],
  },
  globe: {
    mode: "stroke",
    defaultStrokeWidth: 1.9,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [
      { type: "circle", cx: 12, cy: 12, r: 8.5 },
      { type: "path", d: "M3.5 12h17" },
      {
        type: "path",
        d: "M12 3.5c2.2 2.4 3.3 5.3 3.3 8.5s-1.1 6.1-3.3 8.5c-2.2-2.4-3.3-5.3-3.3-8.5s1.1-6.1 3.3-8.5z",
      },
    ],
  },
  /**
   * §2 "1a".5 / "1b": someone is sitting in a voice room right now. Four bars,
   * drawn at stroke 3 so it still reads inside the 19x19 strip tile.
   */
  "audio-wave": {
    mode: "stroke",
    defaultStrokeWidth: 3,
    strokeLinecap: "round",
    children: [{ type: "path", d: "M5 10v4M10 6v12M15 8v8M20 11v2" }],
  },
  /** §2 "1a".6: a muted conversation — the bell with its slash. */
  "bell-off": {
    mode: "stroke",
    defaultStrokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [
      { type: "path", d: "M8.5 4.5A5.5 5.5 0 0 1 17.5 9c0 5 2 6.5 2 6.5H6" },
      { type: "path", d: "M10 19a2.2 2.2 0 0 0 4 0" },
      { type: "path", d: "M3 3l18 18" },
    ],
  },
  /** §2 "1a".5: the @ mark inside the 20px mention badge. */
  mention: {
    mode: "stroke",
    defaultStrokeWidth: 2.4,
    strokeLinecap: "round",
    children: [
      { type: "circle", cx: 12, cy: 12, r: 4 },
      {
        type: "path",
        d: "M16 8v5.5a3.5 3.5 0 0 0 3.5 3.5c1.4 0 2.5-1.6 2.5-4.5A10 10 0 1 0 16 20.5",
      },
    ],
  },
  /**
   * §2 "1b": which client a friend is signed in from. A handset, distinct from
   * `phone`, which is the telephone-call glyph.
   */
  "device-mobile": {
    mode: "stroke",
    defaultStrokeWidth: 2.2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [
      { type: "rect", x: 7, y: 2.5, width: 10, height: 19, rx: 3 },
      { type: "path", d: "M11 18.5h2" },
    ],
  },
  "message-square": {
    mode: "stroke",
    defaultStrokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [{ type: "path", d: "M4 4h16v12H8l-4 4z" }],
  },
  settings: {
    mode: "stroke",
    defaultStrokeWidth: 2,
    strokeLinecap: "round",
    children: [
      { type: "circle", cx: 12, cy: 12, r: 3 },
      {
        type: "path",
        d: "M12 5V3M12 21v-2M5 12H3M21 12h-2M6.4 6.4L5 5M19 19l-1.4-1.4M17.6 6.4L19 5M5 19l1.4-1.4",
      },
    ],
  },
  // 4a satisfaction faces. Drawn, not typed: an emoji character renders with the
  // platform's own colour font, which cannot follow the selected/unselected tint.
  "face-bad": {
    mode: "stroke",
    defaultStrokeWidth: 1.8,
    strokeLinecap: "round",
    children: [
      { type: "circle", cx: 12, cy: 12, r: 9 },
      { type: "path", d: "M15.5 14.7c-1 1.2-2.2 1.8-3.5 1.8s-2.5-.6-3.5-1.8" },
      { type: "path", d: "M9 10h.01M15 10h.01", strokeWidth: 2.6 },
    ],
  },
  "face-okay": {
    mode: "stroke",
    defaultStrokeWidth: 1.8,
    strokeLinecap: "round",
    children: [
      { type: "circle", cx: 12, cy: 12, r: 9 },
      { type: "path", d: "M8.5 15.5h7" },
      { type: "path", d: "M9 10h.01M15 10h.01", strokeWidth: 2.6 },
    ],
  },
  "face-good": {
    mode: "stroke",
    defaultStrokeWidth: 1.9,
    strokeLinecap: "round",
    children: [
      { type: "circle", cx: 12, cy: 12, r: 9 },
      { type: "path", d: "M8.5 14c1 1.2 2.2 1.8 3.5 1.8s2.5-.6 3.5-1.8" },
      { type: "path", d: "M9 10h.01M15 10h.01", strokeWidth: 2.6 },
    ],
  },
  "face-great": {
    mode: "stroke",
    defaultStrokeWidth: 1.8,
    strokeLinecap: "round",
    children: [
      { type: "circle", cx: 12, cy: 12, r: 9 },
      { type: "path", d: "M8 13.5c1.2 1.8 2.6 2.7 4 2.7s2.8-.9 4-2.7" },
      { type: "path", d: "M8.6 9.6l1.8 1-1.8 1M15.4 9.6l-1.8 1 1.8 1" },
    ],
  },
} as const satisfies Record<MobileLineIconName, MobileLineIconDefinition>;
