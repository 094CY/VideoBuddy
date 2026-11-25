import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/** 运行时异常的兜底页面 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[VideoBuddy] 渲染异常:', error.message, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
        <div className="max-w-sm text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6 text-muted-foreground" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-base font-medium">页面遇到问题</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              可以尝试重新加载。如果反复出现，建议先导出数据备份，再清理浏览器站点数据。
            </p>
          </div>
          <Button onClick={() => window.location.reload()} className="gap-2">
            <RotateCcw className="w-4 h-4" />
            重新加载
          </Button>
        </div>
      </div>
    );
  }
}
