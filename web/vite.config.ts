// 0x Sneaky Alpha web build. Licensed under GPL-3.0.
import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

function listPublic(dir: string, root = dir): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listPublic(full, root) : [relative(root, full).split('\\').join('/')];
  });
}

/** Emits sw.js with a precache list of every built file, versioned by content. */
function serviceWorker(): Plugin {
  return {
    name: 'app-sw',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const files = ['index.html', ...Object.keys(bundle).filter((f) => f !== 'index.html'), ...listPublic('public')];
      const unique = [...new Set(files)].filter((f) => !f.endsWith('.map')).sort();
      const hash = createHash('sha256');
      for (const name of Object.keys(bundle).sort()) {
        const item = bundle[name];
        hash.update(name);
        hash.update(item.type === 'chunk' ? item.code : typeof item.source === 'string' ? item.source : Buffer.from(item.source));
      }
      const version = hash.digest('hex').slice(0, 12);
      const source = readFileSync('sw/sw-template.js', 'utf8')
        .replace('__VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify(unique.map((f) => './' + f)));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [preact(), serviceWorker()],
  build: { target: 'safari15', sourcemap: false, assetsInlineLimit: 0 },
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
  },
} as Parameters<typeof defineConfig>[0]);
