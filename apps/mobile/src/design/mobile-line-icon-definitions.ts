export const MOBILE_LINE_ICON_NAMES = [
  "alert-circle",
  "audit-log",
  "back-arrow",
  "bell",
  "block",
  "bolt",
  "calendar",
  "camera",
  "chat-bubble",
  "check",
  "chevron-down",
  "chevron-right",
  "clock",
  "close",
  "dots-vertical",
  "edit",
  "emoji",
  "external-link",
  "file",
  "flag",
  "grip",
  "headphones",
  "info",
  "invite-user",
  "leave",
  "log-out",
  "lock",
  "members",
  "mic",
  "mic-off",
  "minus-circle",
  "moon",
  "person-plus",
  "phone",
  "play-circle",
  "plus",
  "profile",
  "search",
  "send",
  "servers",
  "shield",
  "speaker",
  "star",
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
  | MobileLineIconCircleDefinition
  | MobileLineIconPathDefinition
  | MobileLineIconRectDefinition;

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
  | MobileLineIconFillDefinition
  | MobileLineIconStrokeDefinition;

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
  "dots-vertical": {
    mode: "stroke",
    defaultStrokeWidth: 2.6,
    strokeLinecap: "round",
    children: [{ type: "path", d: "M12 5h.01M12 12h.01M12 19h.01" }],
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
      { type: "path", d: "M6 3h3l1.5 4.5L8 9.5a12 12 0 0 0 6.5 6.5l2-2.5L21 15v3a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2Z" },
    ],
  },
  star: {
    mode: "stroke",
    defaultStrokeWidth: 1.9,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [
      { type: "path", d: "M12 3.5l2.5 5.2 5.7.7-4.2 3.9 1.1 5.6-5.1-2.8-5.1 2.8 1.1-5.6L3.8 9.4l5.7-.7z" },
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
} as const satisfies Record<MobileLineIconName, MobileLineIconDefinition>;
