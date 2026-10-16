"use client";

import { createElement, lazy, Suspense, useState, type ComponentType, type ComponentProps } from "react";
import { ErrorBoundary } from "@iteamify/ui/components/common/error-boundary";
import { Button } from "@iteamify/ui/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@iteamify/ui/components/ui/dialog";
import { useT } from "../i18n";

interface LoadingProps {
  onDismiss?: () => void;
  active?: boolean;
  presentation?: "dialog" | "floating" | "inline";
}

/** Declare at module scope. A retry creates a new lazy identity only after a
 * failure; ordinary renders preserve the loaded feature and all its state. */
// React's ComponentType constraint is variance-sensitive. Keep the concrete C
// so the public props remain inferred, as in React.lazy's own signature.
export function deferredFeature<C extends ComponentType<any>>(load: () => Promise<{ default: C }>) {
  type P = ComponentProps<C>;
  const Initial = lazy(load);
  function DeferredFeature({ onDismiss, active = true, presentation = "dialog", ...props }: P & LoadingProps) {
    const [Loaded, setLoaded] = useState(() => Initial);
    return (
      <ErrorBoundary fallback={({ reset }) => (
        active ? <FeatureStatus presentation={presentation} onDismiss={onDismiss} onRetry={() => {
          // Resetting ErrorBoundary alone would reuse React.lazy's rejection.
          setLoaded(() => lazy(load));
          reset();
        }} /> : null
      )}>
        <Suspense fallback={active ? <FeatureStatus presentation={presentation} onDismiss={onDismiss} /> : null}>
          {createElement(Loaded, props as P)}
        </Suspense>
      </ErrorBoundary>
    );
  }
  return DeferredFeature;
}

function FeatureStatus({ presentation, onDismiss, onRetry }: Pick<LoadingProps, "onDismiss"> & { presentation: NonNullable<LoadingProps["presentation"]>; onRetry?: () => void }) {
  const { t } = useT("common");
  const label = onRetry ? t(($) => $.feature_load_failed) : t(($) => $.loading);
  const content = (
    <div className="space-y-3 p-4">
      <p role={onRetry ? "alert" : "status"} aria-live="polite" className="text-sm text-muted-foreground">{label}</p>
      <div className="flex gap-2">
        {onRetry && <Button size="sm" onClick={onRetry}>{t(($) => $.retry)}</Button>}
        {onDismiss && <Button size="sm" variant="outline" onClick={onDismiss}>{t(($) => $.cancel)}</Button>}
      </div>
    </div>
  );
  if (presentation === "dialog") {
    return (
      <Dialog open onOpenChange={(open) => { if (!open) onDismiss?.(); }}>
        <DialogContent finalFocus={false} className="sm:max-w-sm" aria-describedby={undefined}>
          <DialogTitle className="sr-only">{label}</DialogTitle>
          {content}
        </DialogContent>
      </Dialog>
    );
  }
  return <div className={presentation === "floating" ? "absolute bottom-2 right-2 z-50 rounded-xl bg-surface-raised shadow-[var(--floating-shadow)] ring-1 ring-surface-border" : undefined}>{content}</div>;
}
