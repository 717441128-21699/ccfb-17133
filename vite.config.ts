import { defineConfig } from 'vite';

// 相对路径 base，保证 dist 可以放在任意静态目录 / file 预览服务下
export default defineConfig({
  base: './',
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1600,
    sourcemap: false,
  },
  server: {
    host: '127.0.0.1',
    port: 5188,
  },
  preview: {
    host: '127.0.0.1',
    port: 4188,
  },
});
