"use client";

import { OwnerGuard } from "@teamify/views/layout";
import { OrgPage } from "@teamify/views/org";

export default function OrgPageWithGuard() {
  return <OwnerGuard><OrgPage /></OwnerGuard>;
}
