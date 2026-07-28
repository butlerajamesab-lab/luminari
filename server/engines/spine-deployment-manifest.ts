export function create_spine_deployment_manifest() {
  return {
    requiredEnvVars: [
      "DATABASE_URL",
      "JWT_SECRET",
      "SUPABASE_URL",
      "SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "BUILT_IN_FORGE_API_URL",
      "BUILT_IN_FORGE_API_KEY",
    ],
    optionalEnvVars: ["SPINE_EXPORT_SIGNING_KEY"],
    nodeVersion: ">=20.0.0",
    packageManager: "npm",
    buildCommand: "npm run build",
    startCommand: "npm start",
    databaseType: "postgresql" as const,
    migrationStrategy: "supabase_sql_migrations",
    secretsIncluded: false,
  };
}
