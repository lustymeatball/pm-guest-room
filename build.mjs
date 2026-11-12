import * as esbuild from 'esbuild';
import fs from 'node:fs';

const watch = process.argv.includes('--watch');
fs.mkdirSync('dist', { recursive: true });
fs.copyFileSync('src/renderer/index.html', 'dist/index.html');
fs.copyFileSync('src/renderer/logo.png', 'dist/logo.png');

const options = {
  entryPoints: ['src/renderer/index.jsx'],
  bundle: true,
  outfile: 'dist/renderer.js',
  format: 'iife',
  platform: 'browser',
  target: 'chrome128',
  jsx: 'automatic',
  loader: { '.woff': 'file', '.woff2': 'file', '.ttf': 'file', '.svg': 'file' },
  sourcemap: watch ? 'inline' : false,
  minify: !watch,
  define: { 'process.env.NODE_ENV': watch ? '"development"' : '"production"' },
  logLevel: 'info',
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
