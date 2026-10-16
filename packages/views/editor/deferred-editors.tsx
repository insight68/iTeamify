"use client";

import { forwardRef } from "react";
import { deferredFeature } from "../common/deferred-feature";
import type { ContentEditorProps, ContentEditorRef } from "./content-editor";
import type { TitleEditorProps, TitleEditorRef } from "./title-editor";

const loadContent = () => import("./content-editor").then((m) => ({ default: m.ContentEditor }));
const loadTitle = () => import("./title-editor").then((m) => ({ default: m.TitleEditor }));
const Content = deferredFeature(loadContent);
const Title = deferredFeature(loadTitle);

// Hosts still own activation, onReady, focus targets and queued uploads. These
// wrappers only defer the module and pass the entire imperative ref through.
export const ContentEditor = forwardRef<ContentEditorRef, ContentEditorProps>(
  function DeferredContentEditor(props, ref) {
    return <Content {...props} ref={ref} presentation="inline" />;
  },
);
export const TitleEditor = forwardRef<TitleEditorRef, TitleEditorProps>(
  function DeferredTitleEditor(props, ref) {
    return <Title {...props} ref={ref} presentation="inline" />;
  },
);

// Feature entry points request their editor dependencies in parallel with the
// feature chunk, avoiding a second network waterfall on first use.
export const preloadContentEditor = loadContent;
export const preloadEditors = () => Promise.all([loadContent(), loadTitle()]);
