import type {
  SaveTextDocumentRequest,
  SaveTextDocumentResult,
  TextDocumentSnapshot,
} from "../files/fileTypes";
import { saveMarkdownDocument } from "../files/fileApi";

/**
 * Builds a save request from the ORIGINAL snapshot metadata.
 *
 * The draft is LF-normalized editor text; newline style and BOM presence
 * must never be re-detected from it, or saving would silently rewrite the
 * file's on-disk representation. As a defensive guard the draft is
 * re-normalized to LF before building the request so a stray CR never
 * reaches the writer's newline re-encoding.
 */
function normalizeDraft(draft: string): string {
  return draft.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function buildSaveRequest(
  snapshot: TextDocumentSnapshot,
  draft: string,
): SaveTextDocumentRequest {
  return {
    path: snapshot.path,
    content: normalizeDraft(draft),
    expectedModifiedAtMs: snapshot.modifiedAtMs,
    expectedSize: snapshot.size,
    newline: snapshot.newline,
    hasUtf8Bom: snapshot.hasUtf8Bom,
  };
}

export async function saveDocument(
  snapshot: TextDocumentSnapshot,
  draft: string,
): Promise<SaveTextDocumentResult> {
  return saveMarkdownDocument(buildSaveRequest(snapshot, draft));
}

/** Matches the serialized shape of the Rust ExternalModificationConflict error. */
export function isExternalModificationConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "externalModificationConflict"
  );
}
