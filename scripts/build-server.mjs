// Kompilasi server (TypeScript) → build/*.mjs, supaya hosting tidak butuh tsx/TypeScript
import { build } from 'esbuild';

await build({
  entryPoints: { server: 'server.ts', db: 'scripts/db.ts' },
  outdir: 'build',
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  packages: 'external', // node_modules dipasang di server dengan npm install
  sourcemap: true,
  logLevel: 'info',
});
