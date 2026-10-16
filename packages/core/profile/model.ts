import type { UpdateMeRequest, User } from "../types";
import { readQuestionnaire } from "./questionnaire";
import type { Role } from "../onboarding/types";

export const MAX_PROFILE_DESCRIPTION_LEN = 2000;
export interface PersonalProfile {
  name: string;
  avatar_url: string;
  profile_description: string;
  role: Role | null;
  role_other: string | null;
  role_skipped: boolean;
}
export const PROFILE_KEYS = ["name", "avatar_url", "profile_description", "role", "role_other", "role_skipped"] as const;

export function personalProfile(user: User): PersonalProfile {
  const answers = readQuestionnaire(user.onboarding_questionnaire);
  return { name: user.name ?? "", avatar_url: user.avatar_url ?? "", profile_description: user.profile_description ?? "",
    role: answers.role, role_other: answers.role_other, role_skipped: answers.role_skipped };
}
export const profileValueEqual = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
export const profilesEqual = (left: PersonalProfile, right: PersonalProfile) => PROFILE_KEYS.every((key) => profileValueEqual(left[key], right[key]));

export function profileValid(value: PersonalProfile) {
  return !!value.name.trim() && value.profile_description.length <= MAX_PROFILE_DESCRIPTION_LEN &&
    (value.role_other ?? "").length <= MAX_PROFILE_DESCRIPTION_LEN;
}

/** Send only changed groups; never copy acquisition fields from a form snapshot. */
export function profilePatch(next: PersonalProfile, saved: PersonalProfile): UpdateMeRequest {
  const input: UpdateMeRequest = {};
  for (const key of ["name", "avatar_url", "profile_description"] as const) {
    if (next[key] !== saved[key]) input[key] = next[key];
  }
  const questionnaire: NonNullable<UpdateMeRequest["questionnaire"]> = {};
  if (["role", "role_other", "role_skipped"].some((key) => !profileValueEqual(next[key as keyof PersonalProfile], saved[key as keyof PersonalProfile]))) {
    Object.assign(questionnaire, { role: next.role, role_other: next.role_other, role_skipped: next.role_skipped });
  }
  if (Object.keys(questionnaire).length) input.questionnaire = { ...questionnaire, version: 2 };
  return input;
}

/** Later preserves filled fields and marks only unanswered groups as skipped. */
export function profileForAdvance(value: PersonalProfile, saved: PersonalProfile, later = false): PersonalProfile {
  const next = { ...value };
  if (later && !next.name.trim()) next.name = saved.name;
  if (next.role === "other" && !next.role_other?.trim()) {
    next.role = null; next.role_other = null;
  }
  if (!next.role) next.role_skipped = true;
  return next;
}
