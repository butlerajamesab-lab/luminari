type source_artifact = {
  bucket_id?: string | null;
  object_name?: string | null;
  bucket_public?: boolean | null;
  object_present?: boolean;
  storage_state?: string | null;
  storage_updated_at?: string | Date | null;
  object_updated_at?: string | Date | null;
  storage_version_matches?: boolean | null;
  content_sha256?: string | null;
};

/** Only a source already attached to the current catalog row reaches here.
 * Public URLs grant no new access. Private objects never receive a URL or a
 * signed token from this public reader; case-document access stays separate.
 */
export function resource_source_access(
  artifact: source_artifact | undefined,
  project_url: string | undefined,
  expected_sha256?: string | null,
) {
  const unavailable = (status: string) => ({ status, url: null });
  if (!artifact) return unavailable("source_not_registered");
  if (artifact.bucket_public !== true)
    return unavailable("source_access_restricted");
  if (!artifact.object_present || artifact.storage_state !== "active")
    return unavailable("source_object_unavailable");
  if (!expected_sha256 || artifact.content_sha256 !== expected_sha256)
    return unavailable("source_version_unresolved");
  const observed =
    artifact.storage_updated_at &&
    new Date(artifact.storage_updated_at).getTime();
  const current =
    artifact.object_updated_at &&
    new Date(artifact.object_updated_at).getTime();
  // PostgreSQL compares its full timestamp precision before node-postgres/Date
  // can round it to milliseconds. This is an observation check, not a fresh
  // hash of downloaded source bytes.
  if (
    artifact.storage_version_matches !== true ||
    !observed ||
    !current ||
    observed !== current
  )
    return unavailable("source_version_unresolved");
  if (!project_url || !artifact.bucket_id || !artifact.object_name)
    return unavailable("source_url_unavailable");
  try {
    const base = new URL(project_url);
    if (base.protocol !== "https:" || base.username || base.password)
      return unavailable("source_url_unavailable");
    const segments = [artifact.bucket_id, ...artifact.object_name.split("/")];
    if (
      segments.some(
        (segment) => !segment || segment === "." || segment === "..",
      )
    )
      return unavailable("source_url_unavailable");
    const url = new URL(
      `/storage/v1/object/public/${segments.map(encodeURIComponent).join("/")}`,
      base.origin,
    );
    return { status: "public_source_available", url: url.href };
  } catch {
    return unavailable("source_url_unavailable");
  }
}
