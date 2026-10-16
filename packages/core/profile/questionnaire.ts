import { z } from "zod";
import type { QuestionnaireAnswers } from "../onboarding/types";

export const EMPTY_QUESTIONNAIRE: QuestionnaireAnswers = {
  source: [], source_other: null, source_skipped: false,
  role: null, role_other: null, role_skipped: false,
  use_case: [], use_case_other: null, use_case_skipped: false, version: 2,
};

export const questionnaireSchema = z.object({
  source: z.array(z.enum(["friends_colleagues", "search", "social_x", "social_linkedin", "social_youtube", "social_github", "social_other", "blog_newsletter", "ai_assistant", "from_work", "event_conference", "dont_remember", "other"])),
  source_other: z.string().nullable(), source_skipped: z.boolean(),
  role: z.enum(["engineer", "product", "designer", "founder", "marketing", "writer", "research", "ops", "student", "other"]).nullable(),
  role_other: z.string().nullable(), role_skipped: z.boolean(),
  use_case: z.array(z.enum(["ship_code", "manage_team", "personal_tasks", "plan_research", "write_publish", "automate_ops", "evaluate", "other"])),
  use_case_other: z.string().nullable(), use_case_skipped: z.boolean(), version: z.literal(2),
});

/** Normalize older JSONB answers and default malformed fields independently. */
export function readQuestionnaire(raw: Record<string, unknown> = {}): QuestionnaireAnswers {
  const array = (value: unknown) => Array.isArray(value) ? value : typeof value === "string" && value ? [value] : [];
  const normalized = { ...raw, source: array(raw.source), use_case: array(raw.use_case) };
  const result = Object.fromEntries(Object.entries(questionnaireSchema.shape).map(([key, schema]) => {
    const value = schema.safeParse(normalized[key as keyof typeof normalized]);
    return [key, value.success ? value.data : EMPTY_QUESTIONNAIRE[key as keyof QuestionnaireAnswers]];
  }));
  return result as unknown as QuestionnaireAnswers;
}
