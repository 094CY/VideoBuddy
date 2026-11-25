import { useState, useRef, useEffect } from 'react';
import {
  Type,
  ImageIcon,
  Video,
  Music,
  FileText,
  Sparkles,
  Plus,
  X,
  ChevronRight,
  Mic,
  MusicIcon,
  Volume2,
  Wand2,
  Clapperboard,
  Clock,
  PenLine,
  RotateCw,
  Languages,
  Hash,
  Paintbrush,
  Layers,
  Eraser,
  ZoomIn,
  Film,
  FrameIcon,
  Scissors,
  Palette,
} from 'lucide-react';
import type { NodeType } from '@/types';
import { cn } from '@/lib/utils';

interface NodePanelProps {
  onAddNode: (type: NodeType, extraData?: Record<string, unknown>) => void;
  onOpenStoryExtrapolation?: () => void;
  onOpenTimeExtrapolation?: () => void;
  isStoryOpen?: boolean;
  isTimeOpen?: boolean;
}

interface SubItem {
  label: string;
  desc?: string;
  icon?: React.ReactNode;
  extraData?: Record<string, unknown>;
  action?: 'story-extrapolation' | 'time-extrapolation';
}

interface NodeCategory {
  type: NodeType;
  label: string;
  desc: string;
  capabilities: string[];
  icon: React.ReactNode;
  iconColor: string;
  bgColor: string;
  borderColor: string;
  subItems?: SubItem[];
}

const nodeCategories: NodeCategory[] = [
  {
    type: 'text',
    label: '文本',
    desc: '脚本、广告词、品牌文案',
    capabilities: ['品牌广告文案撰写', 'AI 智能续写 / 改写', '多语言翻译', '关键词提取'],
    icon: <Type className="w-4 h-4" />,
    iconColor: 'text-indigo-400',
    bgColor: 'bg-indigo-500/10',
    borderColor: 'border-indigo-500/20',
    subItems: [
      { label: '品牌广告文案', desc: '品牌/广告/营销文案撰写', icon: <PenLine className="w-3 h-3" />, extraData: { textSubType: 'copywriting' } },
      { label: 'AI 续写 / 改写', desc: '智能续写、改写、润色', icon: <RotateCw className="w-3 h-3" />, extraData: { textSubType: 'rewrite' } },
      { label: '多语言翻译', desc: '多语种互译', icon: <Languages className="w-3 h-3" />, extraData: { textSubType: 'translate' } },
      { label: '关键词提取', desc: 'SEO/标签/摘要提取', icon: <Hash className="w-3 h-3" />, extraData: { textSubType: 'keywords' } },
    ],
  },
  {
    type: 'image',
    label: '图片',
    desc: 'AI 生成图片与重绘',
    capabilities: ['文生图', '参考描述重绘', '背景方案', '高分辨率重绘'],
    icon: <ImageIcon className="w-4 h-4" />,
    iconColor: 'text-slate-500',
    bgColor: 'bg-slate-500/10',
    borderColor: 'border-slate-500/20',
    subItems: [
      { label: '文生图', desc: '输入文字描述生成图片', icon: <Paintbrush className="w-3 h-3" />, extraData: { imageSubType: 'txt2img' } },
      { label: '参考描述重绘', desc: '结合参考图描述重新生成，不直接编辑原图', icon: <Layers className="w-3 h-3" />, extraData: { imageSubType: 'img2img' } },
      { label: '背景方案', desc: '生成背景描述文案，不执行抠图', icon: <Eraser className="w-3 h-3" />, extraData: { imageSubType: 'bg-remove' } },
      { label: '高分辨率重绘', desc: '以高分辨率参数重新出图，非超分放大', icon: <ZoomIn className="w-3 h-3" />, extraData: { imageSubType: 'upscale' } },
    ],
  },
  {
    type: 'video',
    label: '视频',
    desc: 'AI 生成视频片段',
    capabilities: ['文字生成视频', '首帧生视频', '片段汇总', '按风格重生成'],
    icon: <Video className="w-4 h-4" />,
    iconColor: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/20',
    subItems: [
      { label: '文字生成视频', desc: '输入描述生成视频片段', icon: <Film className="w-3 h-3" />, extraData: { videoSubType: 'txt2vid' } },
      { label: '首帧生视频', desc: '参考图片作为首帧生成视频', icon: <FrameIcon className="w-3 h-3" />, extraData: { videoSubType: 'img2vid' } },
      { label: '片段汇总', desc: '汇总上游视频地址，不合成文件', icon: <Scissors className="w-3 h-3" />, extraData: { videoSubType: 'concat' } },
      { label: '按风格重生成', desc: '按风格描述重新出视频，非转绘原片', icon: <Palette className="w-3 h-3" />, extraData: { videoSubType: 'style-transfer' } },
    ],
  },
  {
    type: 'audio',
    label: '音频',
    desc: '语音合成与配乐方案',
    capabilities: ['AI 语音合成 (TTS)', '配乐方案', '音效方案'],
    icon: <Music className="w-4 h-4" />,
    iconColor: 'text-pink-400',
    bgColor: 'bg-pink-500/10',
    borderColor: 'border-pink-500/20',
    subItems: [
      { label: 'AI 语音合成 (TTS)', desc: '真实生成音频文件', icon: <Mic className="w-3 h-3" />, extraData: { audioSubType: 'tts' } },
      { label: '背景音乐方案', desc: '生成配乐文字方案，不产出音频', icon: <MusicIcon className="w-3 h-3" />, extraData: { audioSubType: 'bgm' } },
      { label: '音效方案', desc: '生成音效文字方案，不产出音频', icon: <Volume2 className="w-3 h-3" />, extraData: { audioSubType: 'sfx' } },
    ],
  },
  {
    type: 'script',
    label: '脚本',
    desc: '结构化分镜管理',
    capabilities: ['分镜脚本编排', '场景时间线管理', '角色与道具标注', '批量分镜导出'],
    icon: <FileText className="w-4 h-4" />,
    iconColor: 'text-violet-400',
    bgColor: 'bg-violet-500/10',
    borderColor: 'border-violet-500/20',
  },
  {
    type: 'ai-process',
    label: 'AI 处理',
    desc: '文本处理与分镜方案',
    capabilities: ['文本扩写', '剧本生成', '风格转换', '分镜方案', '剧情推演'],
    icon: <Sparkles className="w-4 h-4" />,
    iconColor: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10',
    borderColor: 'border-cyan-500/20',
    subItems: [
      { label: '文案扩写', icon: <Type className="w-3 h-3" />, extraData: { processType: 'text-expand' } },
      { label: '剧本生成', icon: <FileText className="w-3 h-3" />, extraData: { processType: 'script-generate' } },
      { label: '风格转换', icon: <Palette className="w-3 h-3" />, extraData: { processType: 'style-transfer' } },
      { label: '9 宫格分镜方案', icon: <Layers className="w-3 h-3" />, extraData: { processType: 'storyboard-grid-9' } },
      { label: '25 宫格分镜方案', icon: <Layers className="w-3 h-3" />, extraData: { processType: 'storyboard-grid-25' } },
      { label: '剧情推演', icon: <Sparkles className="w-3 h-3" />, extraData: { processType: 'story-extrapolate' } },
      { label: '自定义指令', icon: <Wand2 className="w-3 h-3" />, extraData: { processType: 'custom-prompt' } },
    ],
  },
];

export function NodePanel({
  onAddNode,
  onOpenStoryExtrapolation,
  onOpenTimeExtrapolation,
  isStoryOpen,
  isTimeOpen,
}: NodePanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedType, setExpandedType] = useState<NodeType | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setExpandedType(null);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        setExpandedType(null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleDragStart = (event: React.DragEvent, type: NodeType) => {
    event.dataTransfer.setData('application/videobuddy-node', type);
    event.dataTransfer.effectAllowed = 'move';

    // Create a drag preview element so the panel can close without breaking the drag
    const preview = document.createElement('div');
    preview.style.cssText =
      'position:fixed;left:-9999px;top:-9999px;padding:8px 16px;border-radius:8px;background:#3b82f6;color:#fff;font-size:12px;white-space:nowrap;pointer-events:none;z-index:9999;';
    const cat = nodeCategories.find((c) => c.type === type);
    preview.textContent = cat ? `${cat.label} 节点` : type;
    document.body.appendChild(preview);
    event.dataTransfer.setDragImage(preview, 40, 16);

    // Defer panel close so the drag session is already established
    requestAnimationFrame(() => {
      setIsOpen(false);
      setExpandedType(null);
      // Clean up preview element after drag starts
      setTimeout(() => preview.remove(), 0);
    });
  };

  const handleAddNode = (type: NodeType, extraData?: Record<string, unknown>) => {
    onAddNode(type, extraData);
    setIsOpen(false);
    setExpandedType(null);
  };

  return (
    <div ref={panelRef} className="absolute left-5 top-5 z-40">
      {/* Floating Add Button */}
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          if (isOpen) setExpandedType(null);
        }}
        className={cn(
          'w-11 h-11 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg',
          'border border-border backdrop-blur-md',
          isOpen
            ? 'bg-accent rotate-45 scale-105'
            : 'bg-card/80 hover:bg-accent hover:scale-105 hover:shadow-xl'
        )}
        title="添加节点"
      >
        {isOpen ? (
          <X className="w-4.5 h-4.5 text-foreground -rotate-45" />
        ) : (
          <Plus className="w-5 h-5 text-foreground" />
        )}
      </button>

      {/* Expanded Node Menu */}
      {isOpen && (
        <div
          className={cn(
            'absolute left-0 top-14 w-64',
            'bg-card/95 backdrop-blur-xl rounded-2xl border border-border',
            'shadow-2xl',
            'animate-in fade-in slide-in-from-top-2 duration-200'
          )}
        >
          {/* Header */}
          <div className="px-4 pt-3.5 pb-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">添加节点</p>
          </div>

          {/* Node List */}
          <div className="px-2 pb-2 space-y-0.5">
            {nodeCategories.map((cat) => (
              <div key={cat.type}>
                {/* Node Type Row */}
                <div
                  className={cn(
                    'flex items-center gap-3 px-2.5 py-2 rounded-xl cursor-pointer transition-all duration-150 group',
                    expandedType === cat.type
                      ? `${cat.bgColor} ${cat.borderColor} border`
                      : 'hover:bg-accent border border-transparent'
                  )}
                  onClick={() =>
                    setExpandedType(expandedType === cat.type ? null : cat.type)
                  }
                >
                  {/* Icon */}
                  <div
                    className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors',
                      expandedType === cat.type ? cat.bgColor : 'bg-muted'
                    )}
                  >
                    <span
                      className={cn(
                        expandedType === cat.type ? cat.iconColor : 'text-muted-foreground group-hover:text-foreground'
                      )}
                    >
                      {cat.icon}
                    </span>
                  </div>

                  {/* Label + desc */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-foreground leading-tight">
                      {cat.label}
                    </p>
                    <p className="text-[11px] text-muted-foreground leading-tight mt-0.5 truncate">
                      {cat.desc}
                    </p>
                  </div>

                  {/* Expand arrow */}
                  <ChevronRight
                    className={cn(
                      'w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 flex-shrink-0',
                      expandedType === cat.type && 'rotate-90 text-muted-foreground'
                    )}
                  />
                </div>

                {/* Expanded Detail */}
                {expandedType === cat.type && (
                  <div className="ml-3 mr-2 mt-1 mb-2 animate-in fade-in slide-in-from-top-1 duration-150">
                    {/* Sub-items (specific node sub-types) */}
                    {cat.subItems && cat.subItems.length > 0 ? (
                      <div className="pl-8 space-y-1 mb-2.5">
                        {cat.subItems.map((sub, i) => (
                          <button
                            key={i}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent/50 transition text-left"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddNode(cat.type, sub.extraData);
                            }}
                          >
                            <span className={cat.iconColor}>{sub.icon}</span>
                            <span>{sub.label}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      /* Capabilities list for nodes without sub-items */
                      <div className="pl-8 space-y-1 mb-2.5">
                        {cat.capabilities.map((cap, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-2 text-[11px] text-muted-foreground"
                          >
                            <span className={cn('w-1 h-1 rounded-full flex-shrink-0', cat.iconColor.replace('text-', 'bg-'))} />
                            {cap}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="pl-8 flex gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAddNode(cat.type);
                        }}
                        className={cn(
                          'flex-1 py-1.5 rounded-lg text-[11px] font-medium transition-all',
                          'bg-accent hover:bg-accent/80 text-foreground'
                        )}
                      >
                        点击添加
                      </button>
                      <div
                        draggable
                        onDragStart={(e) => handleDragStart(e, cat.type)}
                        className={cn(
                          'px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all cursor-grab active:cursor-grabbing',
                          'bg-muted hover:bg-accent text-muted-foreground hover:text-foreground',
                          'select-none'
                        )}
                      >
                        拖拽
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* AI Creative Tools Section */}
          <div className="px-2 pb-2 pt-1 border-t border-border/50">
            <div className="px-2.5 pt-2 pb-1">
              <div className="flex items-center gap-1.5">
                <Wand2 className="w-3 h-3 text-amber-400/60" />
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">AI 创意工具</p>
              </div>
            </div>
            <button
              className={cn(
                'w-full flex items-center gap-3 px-2.5 py-2 rounded-xl transition-all duration-150 group text-left',
                isStoryOpen ? 'bg-amber-500/10 border border-amber-500/20' : 'hover:bg-accent border border-transparent'
              )}
              onClick={() => {
                setIsOpen(false);
                setExpandedType(null);
                onOpenStoryExtrapolation?.();
              }}
            >
              <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0', isStoryOpen ? 'bg-amber-500/15' : 'bg-muted')}>
                <Clapperboard className={cn('w-3.5 h-3.5', isStoryOpen ? 'text-amber-400' : 'text-muted-foreground group-hover:text-foreground')} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium text-foreground leading-tight">剧情推演</p>
                <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">推演前因后果，扩展故事线</p>
              </div>
              {isStoryOpen && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-medium">打开</span>}
            </button>
            <button
              className={cn(
                'w-full flex items-center gap-3 px-2.5 py-2 rounded-xl transition-all duration-150 group text-left mt-0.5',
                isTimeOpen ? 'bg-blue-500/10 border border-blue-500/20' : 'hover:bg-accent border border-transparent'
              )}
              onClick={() => {
                setIsOpen(false);
                setExpandedType(null);
                onOpenTimeExtrapolation?.();
              }}
            >
              <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0', isTimeOpen ? 'bg-blue-500/15' : 'bg-muted')}>
                <Clock className={cn('w-3.5 h-3.5', isTimeOpen ? 'text-blue-400' : 'text-muted-foreground group-hover:text-foreground')} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium text-foreground leading-tight">画面推演</p>
                <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">预测画面变化，拓展镜头序列</p>
              </div>
              {isTimeOpen && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-medium">打开</span>}
            </button>
          </div>

          {/* Footer hint */}
          <div className="px-4 pb-3 pt-1 border-t border-border/50">
            <p className="text-[10px] text-muted-foreground text-center">
              展开查看节点能力 · 拖拽到画布
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
