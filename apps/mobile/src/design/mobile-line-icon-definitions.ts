export const MOBILE_LINE_ICON_NAMES = [
  "audit-log",
  "back-arrow",
  "bell",
  "camera",
  "chat-bubble",
  "check",
  "chevron-down",
  "chevron-right",
  "clock",
  "edit",
  "emoji",
  "external-link",
  "file",
  "headphones",
  "invite-user",
  "leave",
  "log-out",
  "members",
  "mic",
  "mic-off",
  "plus",
  "profile",
  "search",
  "send",
  "servers",
  "shield",
  "speaker",
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
    children: [{ type: "path", d: "M6 16v-5a6 6 0 0 1 12 0v5l2 3H4zM10 21.5h4" }],
  },
  "chat-bubble": {
    mode: "stroke",
    defaultStrokeWidth: 1.9,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [{ type: "path", d: "M4 5.5h16v11H10l-6 4z" }],
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
      { type: "circle", cx: 12, cy: 8, r: 3.6 },
      { type: "path", d: "M5 20.5c1.3-4 12.7-4 14 0" },
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
    children: [{ type: "path", d: "M4 11l8-7 8 7v9H4z" }],
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
  "log-out": {
    mode: "stroke",
    defaultStrokeWidth: 1.9,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    children: [{ type: "path", d: "M9 4h7v16H9M13 12H4M7 9l-3 3 3 3" }],
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
} as const satisfies Record<MobileLineIconName, MobileLineIconDefinition>;
