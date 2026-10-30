/**
 * ✅ URL MySQL pour Prisma, construite à partir des MÊMES variables que l'application actuelle
 * (DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_DATABASE). DATABASE_URL, si présente, est prioritaire.
 */
export function databaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  const host = env.DB_HOST || '127.0.0.1';
  const port = env.DB_PORT || '3306';
  const user = encodeURIComponent(env.DB_USERNAME || 'root');
  const pass = env.DB_PASSWORD ? `:${encodeURIComponent(env.DB_PASSWORD)}` : '';
  const db = env.DB_DATABASE || 'favor_db1';
  const limit = env.PRISMA_CONNECTION_LIMIT || '5';
  return `mysql://${user}${pass}@${host}:${port}/${db}?connection_limit=${limit}`;
}
