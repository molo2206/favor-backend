#!/usr/bin/env node
/**
 * ✅ Lance Prisma avec l'URL MySQL construite depuis le .env de l'application (DB_HOST, DB_USERNAME…).
 *   node scripts/prisma.js pull       → lit le schéma de la base (lecture seule)
 *   node scripts/prisma.js generate   → génère le client Prisma
 * « migrate » et « db push » sont BLOQUÉS : la base de production n'est jamais modifiée par Prisma.
 */
require('dotenv').config();
const { spawnSync } = require('child_process');

const cmd = process.argv[2];
const allowed = { pull: ['db', 'pull'], generate: ['generate'], validate: ['validate'], format: ['format'] };
if (!allowed[cmd]) {
  console.error(`Commande refusée : « ${cmd} ». Autorisées : ${Object.keys(allowed).join(', ')} (jamais migrate / db push).`);
  process.exit(1);
}

const e = process.env;
const url =
  e.DATABASE_URL ||
  `mysql://${encodeURIComponent(e.DB_USERNAME || 'root')}${e.DB_PASSWORD ? ':' + encodeURIComponent(e.DB_PASSWORD) : ''}@${e.DB_HOST || '127.0.0.1'}:${e.DB_PORT || '3306'}/${e.DB_DATABASE || 'favor_db1'}`;

const r = spawnSync('npx', ['prisma', ...allowed[cmd], '--schema', 'prisma/schema.prisma'], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: url },
  shell: process.platform === 'win32',
});
process.exit(r.status ?? 1);
