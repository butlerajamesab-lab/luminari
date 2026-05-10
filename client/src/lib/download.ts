/**
 * LUMINARI V2 — Reliable File Download Utility
 *
 * Works on mobile (iOS Safari, Android Chrome), desktop browsers,
 * and sandboxed preview environments.
 *
 * Strategy:
 * 1. Try Blob URL download (fastest, most compatible)
 * 2. Fallback to data URI if Blob fails
 * 3. Fallback to window.open if both fail
 */

export function downloadJson(data: unknown, filename: string): void {
  const jsonString = JSON.stringify(data, null, 2);

  // Strategy 1: Blob URL (works in most modern browsers)
  try {
    const blob = new Blob([jsonString], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    // Use a hidden link with target to avoid popup blockers
    const link = document.createElement("a");
    link.style.display = "none";
    link.href = url;
    link.download = filename;
    link.setAttribute("target", "_blank");

    document.body.appendChild(link);

    // Use setTimeout to ensure the link is in the DOM before clicking
    setTimeout(() => {
      link.click();

      // Clean up after a delay to ensure download starts
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 1000);
    }, 0);

    return;
  } catch {
    // Fall through to strategy 2
  }

  // Strategy 2: Data URI (works on iOS Safari, some restricted environments)
  try {
    const encoded = encodeURIComponent(jsonString);
    const dataUri = `data:application/json;charset=utf-8,${encoded}`;
    const link = document.createElement("a");
    link.href = dataUri;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return;
  } catch {
    // Fall through to strategy 3
  }

  // Strategy 3: Open in new tab (user can save manually)
  try {
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  } catch {
    // Last resort: copy to clipboard
    navigator.clipboard?.writeText(jsonString);
    throw new Error("Download failed — content copied to clipboard instead");
  }
}
