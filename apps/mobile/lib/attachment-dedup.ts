import type { Attachment } from "@iteamify/core/types";
import { selectStandaloneAttachments } from "@iteamify/core/attachments/image-sequence";

/** Keep attachment cards and the gallery on the same identity/dedup rules. */
export function standaloneAttachments(
  attachments: Attachment[] | undefined,
  content: string | undefined,
): Attachment[] {
  return selectStandaloneAttachments(content, attachments);
}
