import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { useProjectStore } from '@/stores/project-store';
import { useAuthStore } from '@/stores/auth-store';
import { LoginPage } from '@/pages/login';
import { DashboardPage } from '@/pages/dashboard';
import { WorkspacePage } from '@/pages/workspace';
import { AgentTaskPage } from '@/pages/agent-task';
import { SettingsPage } from '@/pages/settings';
import { TemplatesPage } from '@/pages/templates';
import { AssetsPage } from '@/pages/assets';
import { SkillsPage } from '@/pages/skills';
import { GuidePage } from '@/pages/guide';
import { MainLayout } from '@/components/layout/MainLayout';
import { Toaster } from '@/components/ui/sonner';
import { ConfirmHost } from '@/components/shared/confirm-dialog';
import { SessionBootstrap } from '@/components/shared/session-bootstrap';
import { GlobalSettingsDialog } from '@/components/shared/global-settings-dialog';
import { SyncStatusIndicator } from '@/components/shared/sync-status';
import { FirstRunWizard } from '@/components/shared/first-run-wizard';
import { ManagedConfigLoader } from '@/components/shared/managed-config-loader';


function LegacyProjectRedirect() {
  const { id } = useParams();
  const project = useProjectStore((s) => s.projects.find((p) => p.id === id));
  return <Navigate to={project?.taskMode === 'agent' ? `/task/${id}` : `/canvas/${id}`} replace />;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <SessionBootstrap>
      <div className="min-h-screen bg-background">
        <Routes>
          {/* 登录页 — 独立全屏 */}
          <Route
            path="/login"
            element={
              <PublicRoute>
                <LoginPage />
              </PublicRoute>
            }
          />

          {/* 主区域 — MainLayout（侧边栏常驻）+ Outlet 渲染子路由 */}
          <Route
            element={
              <ProtectedRoute>
                <MainLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/templates" element={<TemplatesPage />} />
            <Route path="/assets" element={<AssetsPage />} />
            <Route path="/skills" element={<SkillsPage />} />
            <Route path="/task/:id" element={<AgentTaskPage />} />
            <Route path="/canvas/:id" element={<WorkspacePage />} />
            {/* 使用指南 */}
            <Route path="/guide" element={<GuidePage />} />
          </Route>

          {/* 独立页面 — 不使用 MainLayout */}
          <Route
            path="/project/:id"
            element={
              <ProtectedRoute>
                <LegacyProjectRedirect />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings/*"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />

          {/* 兜底 */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        <Toaster position="top-right" richColors />
        <ConfirmHost />
        <GlobalSettingsDialog />
        <SyncStatusIndicator />
        <FirstRunWizard />
        <ManagedConfigLoader />
      </div>
      </SessionBootstrap>
    </BrowserRouter>
  );
}
