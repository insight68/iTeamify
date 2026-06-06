"use client";

import { OwnerGuard } from "@teamify/views/layout";
import { SkillsPage } from "@teamify/views/skills";

export default function SkillsRoute() {
  return (
    <OwnerGuard>
      <SkillsPage />
    </OwnerGuard>
  );
}
