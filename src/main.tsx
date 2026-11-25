// origin: 094CY/VideoBuddy
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useThemeStore } from './stores/theme-store.ts'
import { AppErrorBoundary } from './components/shared/error-boundary.tsx'

// 从持久化状态初始化主题（默认深色）
const storedTheme = JSON.parse(localStorage.getItem('videobuddy-theme') || '{}');
const initialTheme = storedTheme?.state?.theme || 'dark';
document.documentElement.classList.remove('light', 'dark');
document.documentElement.classList.add(initialTheme);

function Root() {
  // 订阅主题 store，保证切换时组件重新渲染
  useThemeStore();
  return (
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
