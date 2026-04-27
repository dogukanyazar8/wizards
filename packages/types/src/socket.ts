import { z } from "zod";

export interface DMMessageAuthorPayload {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface DMMessageAttachmentPayload {
  id: string;
  url: string;
  filename: string;
  contentType: string;
  size: number;
  width: number | null;
  height: number | null;
}

export interface DMMessagePayload {
  id: string;
  conversationId: string;
  userId: string;
  content: string;
  replyToId: string | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  author: DMMessageAuthorPayload;
  attachments: DMMessageAttachmentPayload[];
  replyTo: DMMessagePayload | null;
}

export const DMMessageAuthorSchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
});

export const DMMessageAttachmentSchema = z.object({
  id: z.string(),
  url: z.string(),
  filename: z.string(),
  contentType: z.string(),
  size: z.number().int().nonnegative(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
});

export const DMMessagePayloadSchema: z.ZodType<DMMessagePayload> = z.lazy(() =>
  z.object({
    id: z.string(),
    conversationId: z.string(),
    userId: z.string(),
    content: z.string(),
    replyToId: z.string().nullable(),
    editedAt: z.string().nullable(),
    deletedAt: z.string().nullable(),
    createdAt: z.string(),
    author: DMMessageAuthorSchema,
    attachments: z.array(DMMessageAttachmentSchema),
    replyTo: DMMessagePayloadSchema.nullable(),
  }),
);
