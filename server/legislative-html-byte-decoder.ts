import { TextDecoder } from "node:util";

export type legislative_html_decoding = {
  text: string;
  charset: "utf-8" | "windows-1252";
  charset_source: "declared" | "default" | "utf8_replacement_fallback";
};

const WINDOWS_1252_EXTENSION: Readonly<Record<number, string>> = Object.freeze({
  0x80: "\u20AC",
  0x82: "\u201A",
  0x83: "\u0192",
  0x84: "\u201E",
  0x85: "\u2026",
  0x86: "\u2020",
  0x87: "\u2021",
  0x88: "\u02C6",
  0x89: "\u2030",
  0x8A: "\u0160",
  0x8B: "\u2039",
  0x8C: "\u0152",
  0x8E: "\u017D",
  0x91: "\u2018",
  0x92: "\u2019",
  0x93: "\u201C",
  0x94: "\u201D",
  0x95: "\u2022",
  0x96: "\u2013",
  0x97: "\u2014",
  0x98: "\u02DC",
  0x99: "\u2122",
  0x9A: "\u0161",
  0x9B: "\u203A",
  0x9C: "\u0153",
  0x9E: "\u017E",
  0x9F: "\u0178",
});

function decode_windows_1252(buffer: Buffer): string {
  let decoded = "";
  for (const byte of buffer) {
    decoded += WINDOWS_1252_EXTENSION[byte] ?? String.fromCharCode(byte);
  }
  return decoded;
}

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
      text: decode_windows_1252(buffer),
      charset: "windows-1252",
      charset_source: "declared",
    };
  }

  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  if (utf8.includes("\uFFFD")) {
    return {
      text: decode_windows_1252(buffer),
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
