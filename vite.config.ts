import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  worker: {
    format: 'es',
  },
  server: {
    host: '127.0.0.1',
    port: 5188,
  },
  preview: {
    host: '127.0.0.1',
    port: 4188,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
