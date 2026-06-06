"use client";

import { ResetPasswordPage } from "@teamify/views/auth";
import { useRouter } from "next/navigation";

export default function ResetPasswordPageRoute() {
  const router = useRouter();
  return (
    <ResetPasswordPage
      onSuccess={() => router.push("/login")}
      onBack={() => router.push("/login")}
    />
  );
}
