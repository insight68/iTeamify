"use client";

import { useState } from "react";
import { deferredFeature } from "../common/deferred-feature";
import { useSearchStore } from "./search-store";

const Search = deferredFeature(() => import("./search-command").then((m) => ({ default: m.SearchCommand })));

export function DeferredSearchCommand() {
  const open = useSearchStore((s) => s.open);
  const close = useSearchStore((s) => s.setOpen);
  const [opened, setOpened] = useState(open);
  if (open && !opened) setOpened(true);
  if (!open && !opened) return null;
  // Keep the existing search lifecycle after the first use.
  return <Search active={open} onDismiss={() => close(false)} />;
}
