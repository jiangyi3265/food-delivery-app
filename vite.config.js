import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
export default defineConfig({
  plugins: [uni()],
  server: { host: '0.0.0.0', port: 54141, strictPort: true, proxy: { '/food': process.env.FOOD_BACKEND || 'http://127.0.0.1:8086', '/profile': process.env.FOOD_BACKEND || 'http://127.0.0.1:8086' } },
  build: { sourcemap: false }
})
