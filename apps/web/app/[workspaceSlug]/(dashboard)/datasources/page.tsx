"use client";

import { OwnerGuard } from "@teamify/views/layout";
import { DataSourcesPage } from "@teamify/views/datasources";

export default function DataSourcesPageWithGuard() {
  return <OwnerGuard><DataSourcesPage /></OwnerGuard>;
}
