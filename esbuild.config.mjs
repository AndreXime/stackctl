import fs from 'node:fs'
import { build } from 'esbuild'

const startedAt = performance.now()

const outfile = 'dist/cli.js'

function formatSize(bytes) {
   if (bytes < 1024) return `${bytes}b`
   if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}kb`
   return `${(bytes / (1024 * 1024)).toFixed(1)}mb`
}


await build({
   entryPoints: ['src/cli.tsx'],
   bundle: true,
   platform: 'node',
   format: 'esm',
   outfile,
   jsx: 'automatic',
   alias: {
      'react-devtools-core': './esbuild-stubs/react-devtools-core.mjs',
   },
   banner: {
      js: `#!/usr/bin/env node
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);`,
   },
})

const bytes = fs.statSync(outfile).size
const elapsed = Math.round(performance.now() - startedAt)

console.log(` ${outfile} ${formatSize(bytes)}\n`)
console.log(` Done in ${elapsed}ms \n`)
