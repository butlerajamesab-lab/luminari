import { TextDecoder } from "node:util";

export type legislative_html_decoding = {
  text: string;
  charset: "utf-8" | "windows-1252";
  charset_source: "declared" | "default" | "utf8_replacement_fallback";
};

function normalize_charset(value: string): string {
  const charset = value.trim().toLowerCase();
  if (
    charset === "iso-8859-1"
    || charset === "latin1"
    || charset === "latin-1"
    || charset === "windows-1252"
    || charset === "cp1252"
  ) {
    return "windows-1252";
  }
  if (charset === "utf8" || charset === "utf-8") return "utf-8";
  return charset;
}

function sniff_declared_charset(buffer: Buffer, content_type: string | null): string {
  const header_match = String(content_type ?? "").match(
    /charset\s*=\s*["']?\s*([^\s;"']+)/i,
  );
  if (header_match) return normalize_charset(header_match[1]);

  const head = buffer.subarray(0, 8192).toString("latin1");
  const direct_meta = head.match(
    /<meta\b[^>]*charset\s*=\s*["']?\s*([^\s"'/>]+)/i,
  );
  if (direct_meta) return normalize_charset(direct_meta[1]);

  const http_equiv = head.match(
    /<meta\b[^>]*http-equiv\s*=\s*["']?content-type["']?[^>]*content\s*=\s*["'][^"']*charset\s*=\s*([^\s;"']+)/i,
  );
  return http_equiv ? normalize_charset(http_equiv[1]) : "";
}

export function decode_legislative_html_bytes(
  buffer: Buffer,
  content_type: string | null = null,
): legislative_html_decoding {
  if (!buffer || buffer.length === 0) {
    throw new Error("legislative_html_bytes_required");
  }

  const declared_charset = sniff_declared_charset(buffer, content_type);
  if (declared_charset === "windows-1252") {
    return {
      text: new TextDecoder("windows-1252", { fatal: false }).decode(buffer),
      charset: "windows-1252",
      charset_source: "declared",
    };
  }

  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  if (utf8.includes("\uFFFD")) {
    return {
      text: new TextDecoder("windows-1252", { fatal: false }).decode(buffer),
      charset: "windows-1252",
      charset_source: "utf8_replacement_fallback",
    };
  }

  return {
    text: utf8,
    charset: "utf-8",
    charset_source: declared_charset ? "declared" : "default",
  };
}
