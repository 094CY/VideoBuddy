import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import {
  Type,
  ImageIcon,
  Video,
  Music,
  FileText,
  Search,
  PenLine,
  BookOpen,
  Grid3X3,
  LayoutGrid,
  Lightbulb,
  Wand2,
} from 'lucide-react';
import type { NodeType, AIProcessType } from '@/types';

interface QuickMenuItem {
  id: string;
  icon: React.ReactNode;
  label: string;
  desc: string;
  nodeType: NodeType;
  processType?: AIProcessType;
  color: string;
}

const QUICK_MENU_ITEMS: QuickMenuItem[] = [
  {
    id: 'text-node',
    icon: <Type className="w-4 h-4" />,
    label: '文本节点',
    desc: '编写剧本/文案/灵感',
    nodeType: 'text',
    color: 'text-muted-foreground',
  },
  {
    id: 'image-node',
    icon: <ImageIcon className="w-4 h-4" />,
    label: '图片节点',
    desc: '上传或生成图片',
    nodeType: 'image',
    color: 'text-slate-500',
  },
  {
    id: 'video-node',
    icon: <Video className="w-4 h-4" />,
    label: '视频节点',
    desc: '生成或导入视频',
    nodeType: 'video',
    color: 'text-amber-400',
  },
  {
    id: 'audio-node',
    icon: <Music className="w-4 h-4" />,
    label: '音频节点',
    desc: '配乐/语音合成',
    nodeType: 'audio',
    color: 'text-pink-400',
  },
  {
    id: 'script-node',
    icon: <FileText className="w-4 h-4" />,
    label: '脚本节点',
    desc: '结构化分镜脚本',
    nodeType: 'script',
    color: 'text-violet-400',
  },
  {
    id: 'text-expand',
    icon: <PenLine className="w-4 h-4" />,
    label: '文案扩写',
    desc: '将简单创意扩展为完整文案',
    nodeType: 'ai-process',
    processType: 'text-expand',
    color: 'text-cyan-400',
  },
  {
    id: 'script-generate',
    icon: <BookOpen className="w-4 h-4" />,
    label: '剧本生成',
    desc: '从主题生成完整视频剧本',
    nodeType: 'ai-process',
    processType: 'script-generate',
    color: 'text-cyan-400',
  },
  {
    id: 'storyboard-9',
    icon: <Grid3X3 className="w-4 h-4" />,
    label: '9 宫格分镜方案',
    desc: '一键生成9格分镜方案',
    nodeType: 'ai-process',
    processType: 'storyboard-grid-9',
    color: 'text-cyan-400',
  },
  {
    id: 'storyboard-25',
    icon: <LayoutGrid className="w-4 h-4" />,
    label: '25宫格分镜',
    desc: '更丰富的多角度镜头方案',
    nodeType: 'ai-process',
    processType: 'storyboard-grid-25',
    color: 'text-cyan-400',
  },
  {
    id: 'story-extrapolate',
    icon: <Lightbulb className="w-4 h-4" />,
    label: '剧情推演',
    desc: '根据画面推演前后剧情',
    nodeType: 'ai-process',
    processType: 'story-extrapolate',
    color: 'text-cyan-400',
  },
  {
    id: 'custom-prompt',
    icon: <Wand2 className="w-4 h-4" />,
    label: '自定义指令',
    desc: '自定义 AI 处理指令',
    nodeType: 'ai-process',
    processType: 'custom-prompt',
    color: 'text-cyan-400',
  },
];

interface QuickMenuProps {
  onClose: () => void;
  onAddNode: (type: NodeType, extraData?: Record<string, unknown>) => void;
}

export function QuickMenu({ onClose, onAddNode }: QuickMenuProps) {
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = QUICK_MENU_ITEMS.filter(
    (item) =>
      item.label.toLowerCase().includes(search.toLowerCase()) ||
      item.desc.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  const handleSelect = (item: QuickMenuItem) => {
    const extraData: Record<string, unknown> = {};
    if (item.processType) {
      extraData.processType = item.processType;
      extraData.label = item.label;
    }
    onAddNode(item.nodeType, Object.keys(extraData).length > 0 ? extraData : undefined);
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div className="absolute inset-0 z-40" onClick={onClose} />

      {/* Menu */}
      <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-50 w-[420px] rounded-xl border border-border bg-card/95 backdrop-blur-md shadow-2xl animate-scale-in">
        {/* Search */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
          <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <Input
            ref={inputRef}
            placeholder="搜索节点或功能..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'Enter' && filtered.length > 0) {
                handleSelect(filtered[selectedIndex]);
              }
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex((i) => Math.max(i - 1, 0));
              }
            }}
            className="border-0 bg-transparent focus-visible:ring-0 h-8 text-sm p-0"
          />
        </div>

        {/* Items */}
        <div className="max-h-72 overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">无匹配结果</p>
          ) : (
            filtered.map((item, idx) => (
              <button
                key={item.id}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition text-left ${
                  idx === selectedIndex ? 'bg-accent' : 'hover:bg-accent/50'
                }`}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                <div className={`w-8 h-8 rounded-lg bg-accent/80 flex items-center justify-center flex-shrink-0 ${item.color}`}>
                  {item.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-[10px] text-muted-foreground">{item.desc}</p>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="px-4 py-2 border-t border-border/50 flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground">
            
          </p>
          <p className="text-[10px] text-muted-foreground">/ 打开</p>
        </div>
      </div>
    </>
  );
}
