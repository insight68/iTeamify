import { z } from "zod";

export const redditConnectionSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  can_reply: z.boolean().default(false),
  status: z.string(),
});
export const redditConnectionsSchema = z.object({
  configured: z.boolean(),
  connections: z.array(redditConnectionSchema),
});
export const redditContentSchema = z.object({
  fullname: z.string(),
  parent_fullname: z.string(),
  post_fullname: z.string(),
  subreddit: z.string(),
  title: z.string(),
  body: z.string(),
  author: z.string(),
  score: z.number(),
  permalink: z.string(),
  created_utc: z.number(),
  depth: z.number(),
  can_reply: z.boolean(),
  content_version: z.string(),
});
export const redditPageSchema = z.object({
  items: z.array(redditContentSchema),
  next_cursor: z.string(),
  partial: z.boolean(),
  fetched_at: z.string(),
});
export const redditDraftSchema = z.object({
  id: z.string().uuid(),
  connection_id: z.string().uuid(),
  username: z.string(),
  target_fullname: z.string(),
  post_fullname: z.string(),
  subreddit: z.string(),
  target_version: z.string(),
  body: z.string(),
  version: z.number().int().positive(),
  status: z.string(),
  sent_fullname: z.string(),
  error_code: z.string(),
  created_at: z.string(),
  expires_at: z.string(),
});
export const redditDraftListSchema = z.array(redditDraftSchema);
export const redditAuthorizationSchema = z.object({
  url: z
    .string()
    .url()
    .refine((value) => {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        url.hostname === "www.reddit.com" &&
        url.pathname === "/api/v1/authorize"
      );
    }),
});
export type RedditConnection = z.infer<typeof redditConnectionSchema>;
export type RedditContent = z.infer<typeof redditContentSchema>;
export type RedditPage = z.infer<typeof redditPageSchema>;
export type RedditDraft = z.infer<typeof redditDraftSchema>;
export interface RedditDraftInput {
  connection_id: string;
  target_fullname: string;
  target_version: string;
  body: string;
  expected_version?: number;
}
export const emptyRedditPage: RedditPage = {
  items: [],
  next_cursor: "",
  partial: true,
  fetched_at: "",
};
