export type MobileEmojiCategory = "faces" | "gestures" | "symbols";

export type MobileEmojiEntry = {
  readonly category: MobileEmojiCategory;
  readonly emoji: string;
  readonly keywords: readonly string[];
};

export const MOBILE_MESSAGE_EMOJI_DATA: readonly MobileEmojiEntry[] = [
  { category: "faces", emoji: "😀", keywords: ["happy", "smile", "mutlu"] },
  { category: "faces", emoji: "😂", keywords: ["laugh", "funny", "gul"] },
  { category: "faces", emoji: "😍", keywords: ["love", "heart", "sevgi"] },
  { category: "faces", emoji: "😮", keywords: ["wow", "surprise", "sasir"] },
  { category: "faces", emoji: "😢", keywords: ["sad", "cry", "uzgun"] },
  { category: "faces", emoji: "🤔", keywords: ["think", "hmm", "dusun"] },
  { category: "faces", emoji: "😎", keywords: ["cool", "sun", "havalı"] },
  { category: "faces", emoji: "🥳", keywords: ["party", "celebrate", "kutla"] },
  { category: "gestures", emoji: "👍", keywords: ["like", "yes", "onay"] },
  { category: "gestures", emoji: "👎", keywords: ["dislike", "no", "hayir"] },
  { category: "gestures", emoji: "👏", keywords: ["clap", "bravo", "alkis"] },
  { category: "gestures", emoji: "🙌", keywords: ["raise", "yay", "eller"] },
  { category: "gestures", emoji: "🙏", keywords: ["thanks", "please", "tesekkur"] },
  { category: "gestures", emoji: "🤝", keywords: ["deal", "handshake", "anlasma"] },
  { category: "gestures", emoji: "👀", keywords: ["eyes", "look", "bak"] },
  { category: "gestures", emoji: "💪", keywords: ["strong", "muscle", "guc"] },
  { category: "symbols", emoji: "❤️", keywords: ["heart", "love", "kalp"] },
  { category: "symbols", emoji: "🔥", keywords: ["fire", "hot", "ates"] },
  { category: "symbols", emoji: "🎉", keywords: ["party", "confetti", "kutlama"] },
  { category: "symbols", emoji: "✨", keywords: ["sparkle", "magic", "parilti"] },
  { category: "symbols", emoji: "✅", keywords: ["done", "check", "tamam"] },
  { category: "symbols", emoji: "🚀", keywords: ["rocket", "launch", "hiz"] },
  { category: "symbols", emoji: "💯", keywords: ["hundred", "perfect", "yuz"] },
  { category: "symbols", emoji: "⚡", keywords: ["lightning", "fast", "enerji"] },
] as const;
