const ROSETTA_STANDALONE_URL = "https://rosetta-v3-platform.onrender.com";

export function get_rosetta_review_base_url(): string {
  const url = new URL(process.env.ROSETTA_REVIEW_BASE_URL?.trim() || ROSETTA_STANDALONE_URL);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("invalid_rosetta_review_base_url");
  }
  return url.origin;
}
