"use client";

import { use } from "react";
import { SkillDetailPage } from "@teamify/views/skills";
import { OwnerGuard } from "@teamify/views/layout";

export default function SkillDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <OwnerGuard>
      <SkillDetailPage skillId={id} />
    </OwnerGuard>
  );
}
