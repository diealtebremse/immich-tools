import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Immich aktiviert CORS nur bei IMMICH_ENV=development, was das offizielle
// docker-compose nicht setzt. Der Browser spricht deshalb ausschliesslich
// same-origin mit diesem Proxy, nie direkt mit dem Server.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const ziel = (env.IMMICH_URL ?? '').replace(/\/$/, '').replace(/\/api$/, '')
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': { target: ziel, changeOrigin: true },
      },
    },
    define: {
      __IMMICH_API_KEY__: JSON.stringify(env.IMMICH_API_KEY ?? ''),
      // Nur fuer den Link ins fertige Album - alle Abfragen laufen ueber den Proxy.
      __IMMICH_URL__: JSON.stringify(ziel),
    },
  }
})
