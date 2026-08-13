import { useMemo, useState } from "react";
import { AlertTriangle, Download, ExternalLink, FileText, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { use_private_source_access } from "@/hooks/use_private_source_access";

type preview_kind = "pdf" | "image" | "video" | "audio" | "text" | "unsupported";

type source_viewer_props = {
  source_url: string | null | undefined;
  filename: string;
  mime_type: string | null | undefined;
  file_type: string | null | undefined;
};

function source_extension(filename: string): string {
  const last_dot = filename.lastIndexOf(".");
  return last_dot >= 0 ? filename.slice(last_dot + 1).toLowerCase() : "";
}

function resolve_preview_kind(
  mime_type: string,
  file_type: string,
  extension: string,
): preview_kind {
  if (mime_type === "application/pdf" || extension === "pdf") return "pdf";
  if (mime_type.startsWith("image/") || file_type === "image") return "image";
  if (mime_type.startsWith("video/") || file_type === "video") return "video";
  if (mime_type.startsWith("audio/") || file_type === "audio") return "audio";
  if (
    mime_type.startsWith("text/") ||
    mime_type === "application/json" ||
    ["txt", "csv", "json", "md", "markdown"].includes(extension)
  ) {
    return "text";
  }
  return "unsupported";
}

export default function Source_viewer({
  source_url,
  filename,
  mime_type,
  file_type,
}: source_viewer_props) {
  const [load_error, set_load_error] = useState(false);
  const normalized_mime_type = (mime_type || "application/octet-stream").toLowerCase();
  const normalized_file_type = (file_type || "").toLowerCase();
  const extension = source_extension(filename);
  const preview_kind = useMemo(
    () => resolve_preview_kind(normalized_mime_type, normalized_file_type, extension),
    [normalized_mime_type, normalized_file_type, extension],
  );
  const {
    access_url,
    access_error,
    is_resolving,
    retry_access,
  } = use_private_source_access(preview_kind === "unsupported" ? null : source_url);

  if (!source_url) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-8 text-center">
          <FileText className="h-9 w-9 mx-auto mb-3 text-muted-foreground/60" />
          <p className="text-sm font-medium">Source bytes are not addressable from this document record.</p>
          <p className="text-xs text-muted-foreground mt-1">
            The source viewer will not substitute extracted text for missing source evidence.
          </p>
        </CardContent>
      </Card>
    );
  }

  const source_actions = (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" className="gap-1.5" asChild>
        <a href={source_url} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="h-3.5 w-3.5" />
          Open source
        </a>
      </Button>
      <Button variant="outline" size="sm" className="gap-1.5" asChild>
        <a href={source_url} download={filename} target="_blank" rel="noopener noreferrer">
          <Download className="h-3.5 w-3.5" />
          Download
        </a>
      </Button>
    </div>
  );

  return (
    <Card className="overflow-hidden border-primary/20">
      <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="text-sm font-medium">Source Evidence</CardTitle>
          <p className="text-[11px] text-muted-foreground mt-1 truncate">
            Exact stored source · {normalized_mime_type}
          </p>
        </div>
        {source_actions}
      </CardHeader>
      <CardContent className="p-0 border-t border-border/40 bg-black/10">
        {preview_kind !== "unsupported" && is_resolving && (
          <div className="p-8 min-h-[220px] flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Resolving authenticated source access…
          </div>
        )}

        {preview_kind !== "unsupported" && access_error && !is_resolving && (
          <div className="m-4 p-4 rounded-lg border border-red-500/30 bg-red-500/10 flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
            <div className="text-sm flex-1">
              <p className="font-medium text-red-200">Source access could not be resolved.</p>
              <p className="text-xs text-muted-foreground mt-1">{access_error}</p>
              <Button variant="outline" size="sm" className="gap-1.5 mt-3" onClick={retry_access}>
                <RefreshCw className="h-3.5 w-3.5" />
                Retry source access
              </Button>
            </div>
          </div>
        )}

        {load_error && access_url && (
          <div className="m-4 p-4 rounded-lg border border-amber-500/30 bg-amber-500/10 flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-amber-200">The browser could not render this source inline.</p>
              <p className="text-xs text-muted-foreground mt-1">
                The exact source is still available through Open source or Download above.
              </p>
            </div>
          </div>
        )}

        {access_url && preview_kind === "pdf" && (
          <iframe
            src={access_url}
            title={`Source PDF: ${filename}`}
            className="w-full min-h-[72vh] bg-white"
          />
        )}

        {access_url && preview_kind === "image" && (
          <div className="flex items-center justify-center p-4 min-h-[320px]">
            <img
              src={access_url}
              alt={filename}
              className="max-w-full max-h-[75vh] object-contain rounded-md"
              onError={() => set_load_error(true)}
            />
          </div>
        )}

        {access_url && preview_kind === "video" && (
          <div className="flex items-center justify-center p-4 bg-black min-h-[320px]">
            <video
              src={access_url}
              controls
              playsInline
              preload="metadata"
              className="w-full max-h-[75vh] rounded-md bg-black"
              onError={() => set_load_error(true)}
            >
              Your browser does not support HTML video playback.
            </video>
          </div>
        )}

        {access_url && preview_kind === "audio" && (
          <div className="p-6 min-h-[180px] flex items-center justify-center">
            <audio
              src={access_url}
              controls
              preload="metadata"
              className="w-full max-w-3xl"
              onError={() => set_load_error(true)}
            >
              Your browser does not support HTML audio playback.
            </audio>
          </div>
        )}

        {access_url && preview_kind === "text" && (
          <iframe
            src={access_url}
            title={`Source text: ${filename}`}
            sandbox=""
            className="w-full min-h-[65vh] bg-white"
          />
        )}

        {preview_kind === "unsupported" && (
          <div className="p-8 min-h-[240px] flex flex-col items-center justify-center text-center">
            <FileText className="h-10 w-10 text-muted-foreground/60 mb-3" />
            <p className="text-sm font-medium">This source format has no safe native browser renderer.</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xl">
              The exact stored source has not been replaced by extracted or converted content. Use Open source or Download to inspect {filename} with a compatible application.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
