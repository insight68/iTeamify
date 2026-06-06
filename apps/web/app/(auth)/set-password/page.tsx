"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@teamify/core/auth";
import { SetPasswordPage } from "@teamify/views/auth";

export default function SetPasswordPageRoute() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isLoading = useAuthStore((s) => s.isLoading);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [isLoading, user, router]);

  if (isLoading || !user) {
    return null;
  }

  return (
    <SetPasswordPage
      onSuccess={() => router.push("/")}
    />
  );
}
