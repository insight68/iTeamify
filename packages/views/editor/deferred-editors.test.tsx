import { act, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { expect, it, vi } from "vitest";
import { renderWithI18n } from "../test/i18n";
import type { ContentEditorRef } from "./content-editor";
import type { TitleEditorRef } from "./title-editor";
import { ContentEditor, TitleEditor } from "./deferred-editors";

const handles = vi.hoisted(() => ({ focus: vi.fn(), upload: vi.fn(), titleFocus: vi.fn() }));

vi.mock("./content-editor", async () => {
  const { forwardRef, useEffect, useImperativeHandle } = await import("react");
  return { ContentEditor: forwardRef(({ onReady, defaultValue }: { onReady?: () => void; defaultValue?: string }, ref) => {
    useImperativeHandle(ref, () => ({ focus: handles.focus, uploadFile: handles.upload, getMarkdown: () => defaultValue }));
    useEffect(() => { onReady?.(); }, [onReady]);
    return <div>Content ready</div>;
  }) };
});
vi.mock("./title-editor", async () => {
  const { forwardRef, useEffect, useImperativeHandle } = await import("react");
  return { TitleEditor: forwardRef(({ onReady, defaultValue }: { onReady?: () => void; defaultValue?: string }, ref) => {
    useImperativeHandle(ref, () => ({ focus: handles.titleFocus, getText: () => defaultValue }));
    useEffect(() => { onReady?.(); }, [onReady]);
    return <div>Title ready</div>;
  }) };
});

it("preserves editor readiness, initial drafts and imperative focus/upload refs through the deferred boundary", async () => {
  const content = createRef<ContentEditorRef>();
  const title = createRef<TitleEditorRef>();
  const contentReady = vi.fn();
  const titleReady = vi.fn();
  renderWithI18n(<><ContentEditor ref={content} defaultValue="Draft body" onReady={contentReady} /><TitleEditor ref={title} defaultValue="Draft title" onReady={titleReady} /></>);
  await screen.findByText("Content ready");
  await screen.findByText("Title ready");
  await waitFor(() => expect(contentReady).toHaveBeenCalledTimes(1));
  expect(titleReady).toHaveBeenCalledTimes(1);
  expect(content.current?.getMarkdown()).toBe("Draft body");
  expect(title.current?.getText()).toBe("Draft title");
  const file = new File(["payload"], "attachment.txt");
  act(() => { content.current?.focus(); content.current?.uploadFile(file); title.current?.focus(); });
  expect(handles.focus).toHaveBeenCalledTimes(1);
  expect(handles.upload).toHaveBeenCalledWith(file);
  expect(handles.titleFocus).toHaveBeenCalledTimes(1);
});
