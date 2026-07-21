import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    // Keep node_modules (esp. the Agent SDK, which spawns a subprocess and loads a
    // native binary) external instead of bundling them into out/main.
    plugins: [externalizeDepsPlugin()],
    // Bake the build variant into the main bundle. `APP_VARIANT=dev` (see the
    // dist:dev script) makes the packaged app run as a separate "Resume Tailor
    // Dev" with its own userData, so it can be installed alongside prod without
    // sharing settings/applications/usage. Defaults to 'prod'.
    define: {
      __APP_VARIANT__: JSON.stringify(process.env.APP_VARIANT || 'prod')
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') }
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer/src')
      }
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') }
      }
    },
    plugins: [react()]
  }
})
