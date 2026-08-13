import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("case source viewer contract", () => {
  it("mounts the exact stored source in the document workspace", () => {
    const detail_source = read("client/src/pages/DocumentDetail.tsx");
    expect(detail_source).toContain('import Source_viewer from "@/components/Source_viewer"');
    expect(detail_source).toContain("<Source_viewer");
    expect(detail_source).toContain("source_url={doc.s3Url}");
    expect(detail_source).toContain("mime_type={doc.mimeType}");
    expect(detail_source).toContain("file_type={doc.fileType}");
  });

  it("renders browser-native evidence families and preserves unsupported sources", () => {
    const viewer_source = read("client/src/components/Source_viewer.tsx");
    expect(viewer_source).toContain('preview_kind === "pdf"');
    expect(viewer_source).toContain("<iframe");
    expect(viewer_source).toContain('preview_kind === "image"');
    expect(viewer_source).toContain("<img");
    expect(viewer_source).toContain('preview_kind === "video"');
    expect(viewer_source).toContain("<video");
    expect(viewer_source).toContain('preview_kind === "audio"');
    expect(viewer_source).toContain("<audio");
    expect(viewer_source).toContain('preload="metadata"');
    expect(viewer_source).toContain('preview_kind === "text"');
    expect(viewer_source).toContain('sandbox=""');
    expect(viewer_source).toContain('preview_kind === "unsupported"');
    expect(viewer_source).toContain("The exact stored source has not been replaced by extracted or converted content.");
  });
});
