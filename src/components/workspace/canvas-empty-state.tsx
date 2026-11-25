import { useState } from 'react';
import {
  Type,
  ImageIcon,
  Sparkles,
  LayoutGrid,
  MousePointerClick,
  X,
  Play,
} from 'lucide-react';
import type { NodeType } from '@/types';
import { useTemplateStore } from '@/stores/template-store';

interface CanvasEmptyStateProps {
  onAddNode: (type: NodeType, extraData?: Record<string, unknown>) => void;
  onLoadTemplate?: (templateId: string) => void;
}

const quickCreateActions = [
  { label: '文字生视频', icon: <Type className="w-4 h-4" />, type: 'video' as NodeType, extra: { videoSubType: 'txt2vid', label: '文字生视频' } },
  { label: '图片换背景', icon: <ImageIcon className="w-4 h-4" />, type: 'image' as NodeType, extra: { imageSubType: 'bg-remove', label: '图片换背景' } },
  { label: '首帧生视频', icon: <Sparkles className="w-4 h-4" />, type: 'video' as NodeType, extra: { videoSubType: 'img2vid', label: '首帧生视频' } },
];

export function CanvasEmptyState({ onAddNode, onLoadTemplate }: CanvasEmptyStateProps) {
  const [showTemplates, setShowTemplates] = useState(false);
  const { templates } = useTemplateStore();
  const officialTemplates = templates.filter((t) => t.isPublic);

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
      {/* Center hint */}
      <div className="flex items-center gap-2 mb-6 pointer-events-none">
        <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center">
          <MousePointerClick className="w-4 h-4 text-muted-foreground" />
        </div>
        <span className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">双击</span>
          {' '}画布添加节点，或使用下方快捷操作
        </span>
      </div>

      {/* Quick action buttons */}
      <div className="flex items-center gap-2 pointer-events-auto">
        {quickCreateActions.map((action) => (
          <button
            key={action.label}
            onClick={() => onAddNode(action.type, action.extra)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-card/80 backdrop-blur-md border border-border/50 text-sm text-muted-foreground hover:text-foreground hover:bg-card hover:border-border transition-all duration-200 group"
          >
            <span className="text-muted-foreground group-hover:text-foreground transition-colors">
              {action.icon}
            </span>
            {action.label}
          </button>
        ))}

        {/* Template quick picker */}
        <button
          onClick={() => setShowTemplates(!showTemplates)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-card/80 backdrop-blur-md border border-border/50 text-sm text-muted-foreground hover:text-foreground hover:bg-card hover:border-border transition-all duration-200 group"
        >
          <span className="text-muted-foreground group-hover:text-foreground transition-colors">
            <LayoutGrid className="w-4 h-4" />
          </span>
          模板
        </button>
      </div>

      {/* Template quick picker popover */}
      {showTemplates && (
        <div className="mt-3 pointer-events-auto w-[min(480px,92vw)] max-h-[320px] overflow-y-auto rounded-xl bg-card/95 backdrop-blur-xl border border-border/60 shadow-2xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">快速选择模板</span>
            <button onClick={() => setShowTemplates(false)} className="text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {officialTemplates.map((tpl) => (
              <button
                key={tpl.id}
                onClick={() => {
                  onLoadTemplate?.(tpl.id);
                  setShowTemplates(false);
                }}
                className="flex items-start gap-2 p-2.5 rounded-lg border border-border/40 bg-background/50 hover:bg-background hover:border-border text-left transition-all duration-150 group/tpl"
              >
                <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Play className="w-3 h-3 text-amber-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{tpl.name}</p>
                  <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">{tpl.description}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">{tpl.workflowData.nodes.length} 节点</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
