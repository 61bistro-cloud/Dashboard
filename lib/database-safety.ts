/** Fail closed for unlabelled preview databases and remote developer writes. */
export function isLocalDatabase(connection: string | undefined): boolean {
  try {
    const url = new URL(connection ?? "");
    return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}
export function assertDatabaseEnvironment(
  env: NodeJS.ProcessEnv = process.env
) {
  if (env.VERCEL_ENV !== "preview") return;
  const host = new URL(env.DATABASE_URL ?? "").hostname;
  if (
    env.DATABASE_ENVIRONMENT !== "preview" ||
    env.PREVIEW_DATABASE_HOST !== host ||
    host === env.PRODUCTION_DATABASE_HOST
  )
    throw Error(
      "Preview requires a separate, explicitly configured preview database"
    );
}
export function assertDatabaseOperation(
  operation: string,
  env: NodeJS.ProcessEnv = process.env
) {
  assertDatabaseEnvironment(env);
  if (
    env.VERCEL_ENV === "production" ||
    env.VERCEL_ENV === "preview" ||
    isLocalDatabase(env.DATABASE_URL)
  )
    return;
  if (
    [
      "findUnique",
      "findUniqueOrThrow",
      "findFirst",
      "findFirstOrThrow",
      "findMany",
      "count",
      "aggregate",
      "groupBy",
    ].includes(operation)
  )
    return;
  throw Error(
    "Remote database writes are disabled outside the deployed application"
  );
}
export function assertLocalDatabaseTool(env: NodeJS.ProcessEnv = process.env) {
  if (
    env.VERCEL ||
    env.VERCEL_ENV ||
    env.NODE_ENV === "production" ||
    !isLocalDatabase(env.DATABASE_URL) ||
    (env.DIRECT_URL && !isLocalDatabase(env.DIRECT_URL))
  )
    throw Error(
      "Seed/schema tools are restricted to local development databases"
    );
}
