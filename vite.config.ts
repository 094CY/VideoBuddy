import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  // 必须用根路径：'./' 会让深层路由下的 ./assets/* 解析成 /project/assets/*
  // 并被 SPA fallback 返回 HTML，浏览器因 MIME 拒绝执行，页面白屏。
  base: '/',
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      // 统一转发所有 /api/*（含账号、会话、租户工作区），避免新增端点时漏配
      // 必须写 127.0.0.1：macOS 上 localhost 常优先解析成 IPv6 ::1，
      // 而后端只监听 IPv4，会出现代理连不上或落到占用同端口的其它程序。
      '/api': {
        target: 'http://127.0.0.1:3721',
        changeOrigin: true,
      },
      '/local-api/ollama': {
        target: 'http://localhost:11434',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/local-api\/ollama/, ''),
      },
      '/local-api/lm-studio': {
        target: 'http://localhost:1234',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/local-api\/lm-studio/, ''),
      },
      '/local-api/mlx': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/local-api\/mlx/, ''),
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'flow-vendor': ['@xyflow/react'],
          'ui-vendor': ['framer-motion', 'zustand', 'sonner'],
        },
      },
    },
  },
});
