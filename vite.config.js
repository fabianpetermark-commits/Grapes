import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, searchForWorkspaceRoot } from 'vite'

export default defineConfig({
  base: '/Grapes/',
  build: {
    rollupOptions: {
      input: {
        main: resolve('index.html'),
        androidMobilePreview: resolve('design/android-mobile-preview.html'),
        // Isolated PROD Auth page; inactive until explicit release gate and OAuth setup.
        loginAuthProd: resolve('login-auth-prod.html'),
        // Strictly isolated QA Auth origin, inactive in PROD release.
        loginAuthTest: resolve('login-auth-test.html'),
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
