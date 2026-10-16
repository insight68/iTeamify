/** Keep paste recovery metadata independent of the editor engine so draft
 * upload controllers do not load Tiptap before the editor is activated. */
const pastedTextSources = new WeakMap<File, string>();

export function markPastedTextFile(file: File, text: string): File {
  pastedTextSources.set(file, text);
  return file;
}

export function pastedTextSource(file: File): string | undefined {
  return pastedTextSources.get(file);
}
