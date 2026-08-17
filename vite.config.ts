import build from '@hono/vite-build/node'
import adapter from '@hono/vite-dev-server/node'
import tailwindcss from '@tailwindcss/vite'
import honox from 'honox/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    honox({
      devServer: { adapter },
      client: { input: ['/app/client.ts', '/app/style.css'] }
    }),
    tailwindcss(),
    build({ staticRoot: './dist' })
  ],
  build: {
    // 两步构建（client + ssr）共享 dist：第二步不再清空，避免重复清理/沙箱回收站拦截
    emptyOutDir: false,
  },
  ssr: {
    external: ['better-sqlite3']
  }
})
