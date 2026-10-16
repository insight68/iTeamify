import { z } from "zod";
import { EMPTY_USER, UserSchema } from "../api/schemas";
import type { LoginResponse } from "../api/client";

export type AuthPurpose = "login" | "signup" | "reset" | "set_password";
export interface AuthChallenge {
  challenge_id: string;
  retry_after_seconds: number;
  expires_in_seconds: number;
}
export interface AuthProof {
  email: string;
  purpose: AuthPurpose;
  challenge_id: string;
  proof: string;
}
export type AuthVerification =
  | (LoginResponse & { action: "authenticated" })
  | { action: "signup" | "reset" | "set_password"; proof: string };

export const LoginResponseSchema = z.object({
  token: z.string().min(1),
  user: UserSchema.extend({ id: z.string().min(1), email: z.string().min(1) }),
});
export const EMPTY_LOGIN: LoginResponse = { token: "", user: EMPTY_USER };
export const AuthChallengeSchema = z.object({
  challenge_id: z.uuid(),
  retry_after_seconds: z.number().int().nonnegative(),
  expires_in_seconds: z.number().int().positive(),
});
export const AuthVerificationSchema = z.discriminatedUnion("action", [
  LoginResponseSchema.extend({ action: z.literal("authenticated") }),
  z.object({ action: z.enum(["signup", "reset", "set_password"]), proof: z.string().length(64) }),
]);
export const PasswordStatusSchema = z.object({ has_password: z.boolean() });
export const PasswordResetSchema = z.object({ success: z.literal(true) });
export const InvitationLoginContextSchema = z.object({ email: z.email() });
