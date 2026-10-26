import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

/**
 * Demo / Playground 配置（npm run dev、npm run build:demo）
 * 库构建走 vite.lib.config.ts。
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // 让 playground 用 `import ... from 'react-bitable'` 直接指向 src，
    // 与最终使用者的 import 路径保持一致
    alias: {
      'react-bitable': fileURLToPath(new URL('./src/index.ts', import.meta.url))
    }
  },
  build: {
    // demo 产物单独放 demo-dist，避免覆盖库构建输出的 dist/
    outDir: 'demo-dist'
  },
  server: {
    port: 5173
  }
});
