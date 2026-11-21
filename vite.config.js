import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, searchForWorkspaceRoot } from 'vite'

export default defineConfig({
  base: '/Grapes/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(process.cwd(), 'index.html'),
        ebook: resolve(process.cwd(), 'ebook.html'),
        ebookReader: resolve(process.cwd(), 'ebook-reader-standalone.html'),
      },
    },
  },
  server: {
    fs: {
      // Managed worktrees may share dependencies through a junction. Keep the
      // dev server restricted to the workspace and that exact dependency root.
      allow: [searchForWorkspaceRoot(process.cwd()), realpathSync(resolve('node_modules'))],
    },
  },
})
