/** Caller-owned SQL expressions only; request values must remain query parameters. */
export function registryJurisdictionJoin(sourceExpression: string, alias = 'j'): string {
  if (!/^[a-z][a-z0-9_]*$/i.test(alias)) throw new Error('Invalid jurisdiction alias');
  const source = `LOWER(BTRIM((${sourceExpression})::text))`;
  // Several catalog rows share a state abbreviation. Resolve metadata once per
  // source row without multiplying program/workflow identities. Conflicting
  // state codes stay unresolved; this does not merge catalog records.
  return `LEFT JOIN LATERAL (
    WITH jurisdiction_matches AS (
      SELECT rj.id, rj.name, rj.abbreviation
      FROM public.registry_jurisdictions rj
      WHERE NULLIF(${source}, '') IS NOT NULL
        AND NULLIF(BTRIM(rj.abbreviation), '') IS NOT NULL
        AND ${source} = ANY(ARRAY[
          LOWER(rj.id), LOWER(rj.abbreviation),
          LOWER('us-' || rj.abbreviation), LOWER('j_' || rj.abbreviation),
          LOWER(BTRIM(rj.name)),
          LOWER(BTRIM(REGEXP_REPLACE(rj.name, '\\s+\\([^)]+\\)$', ''))),
          LOWER('j_' || REPLACE(REGEXP_REPLACE(rj.name, '\\s+\\([^)]+\\)$', ''), ' ', '_'))
        ])
    )
    SELECT jm.id, jm.name, jm.abbreviation
    FROM jurisdiction_matches jm
    WHERE NOT EXISTS (
      SELECT 1 FROM jurisdiction_matches other
      WHERE UPPER(other.abbreviation) IS DISTINCT FROM UPPER(jm.abbreviation)
    )
    ORDER BY (LOWER(jm.id) = ${source}) DESC, jm.id
    LIMIT 1
  ) ${alias} ON true`;
}
