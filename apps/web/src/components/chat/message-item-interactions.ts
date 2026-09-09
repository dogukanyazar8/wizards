export type MessageDoubleClickContext = {
  readonly interactiveTarget: boolean;
  readonly replyable: boolean;
};

export function shouldReplyFromMessageDoubleClick({
  interactiveTarget,
  replyable,
}: MessageDoubleClickContext): boolean {
  return replyable && !interactiveTarget;
}
