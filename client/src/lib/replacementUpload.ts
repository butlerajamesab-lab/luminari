import { getAuthenticatedRequestHeaders } from "@/lib/session-token";

const SESSION_MESSAGE = "Your sign-in session could not be verified. Sign in again, then retry with the selected replacement file.";
const UNCONFIRMED_MESSAGE = "The server did not confirm the replacement. Refresh the document and check its replacement chain before retrying.";

export async function uploadReplacementDocument(documentId: number, file: File): Promise<{ newDocumentId: number }> {
  // Forward Supabase auth explicitly when available, alongside supported session cookies.
  // The server authenticates either session before parsing or buffering multipart bytes.
  const uploadHeaders = await getAuthenticatedRequestHeaders();

  const formData = new FormData();
  formData.append("file", file);
  let response: Response;
  try {
    response = await fetch(`/api/upload/replace/${documentId}`, {
      method: "POST",
      body: formData,
      headers: uploadHeaders,
      credentials: "include",
    });
  } catch {
    // A lost response may follow a committed replacement. Never automatically retry it.
    throw new Error(UNCONFIRMED_MESSAGE);
  }

  if (response.status === 401) throw new Error(SESSION_MESSAGE);

  let data: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = await response.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      data = parsed as Record<string, unknown>;
    }
  } catch {
    // Proxy and multipart failures may be HTML or empty; do not expose a JSON parse error.
  }

  if (!response.ok) {
    const message = typeof data?.message === "string" && data.message.trim()
      ? data.message
      : typeof data?.error === "string" && data.error.trim() ? data.error : null;
    if (message) throw new Error(message);
    if (response.status === 413) throw new Error("The replacement file exceeds the upload size limit (100 MB per file).");
    if (response.status === 429) throw new Error("Uploads are busy. Wait a moment, then retry the selected replacement file.");
    if (response.status >= 500) throw new Error(`${UNCONFIRMED_MESSAGE} (HTTP ${response.status})`);
    throw new Error(`Replacement upload failed (HTTP ${response.status}). The selected file is still available to retry.`);
  }

  if (data?.success !== true || data.originalDocumentId !== documentId ||
      !Number.isSafeInteger(data.newDocumentId) || Number(data.newDocumentId) <= 0) {
    throw new Error(UNCONFIRMED_MESSAGE);
  }
  return { newDocumentId: data.newDocumentId as number };
}
