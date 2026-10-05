// Empaqueta src/main.ts en build/BP/scripts/main.js (los módulos @minecraft/* los pone el juego).
import { build } from 'esbuild';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
await build({
  entryPoints: [path.join(ROOT, 'src', 'main.ts')],
  outfile: path.join(ROOT, 'build', 'BP', 'scripts', 'main.js'),
  bundle: true,
  format: 'esm',
  target: 'es2022',
  platform: 'neutral',
  external: ['@minecraft/server', '@minecraft/server-ui'],
  legalComments: 'none',
  logLevel: 'info',
});
