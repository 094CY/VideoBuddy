import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date): string {
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  if (days < 7) return `${days} 天前`;
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

export function generateId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : 
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + '...';
}

export function getNodeColor(type: string): string {
  const colors: Record<string, string> = {
    text: 'hsl(239 84% 67%)',
    image: 'hsl(142 71% 45%)',
    video: 'hsl(38 92% 50%)',
    audio: 'hsl(330 81% 60%)',
    script: 'hsl(258 90% 66%)',
    'ai-process': 'hsl(187 85% 43%)',
  };
  return colors[type] || 'hsl(239 84% 67%)';
}

export function getNodeBgClass(type: string): string {
  const classes: Record<string, string> = {
    text: 'bg-indigo-500/10 border-indigo-500/30',
    image: 'bg-slate-500/10 border-slate-500/30',
    video: 'bg-amber-500/10 border-amber-500/30',
    audio: 'bg-pink-500/10 border-pink-500/30',
    script: 'bg-violet-500/10 border-violet-500/30',
    'ai-process': 'bg-cyan-500/10 border-cyan-500/30',
  };
  return classes[type] || 'bg-indigo-500/10 border-indigo-500/30';
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    draft: 'text-muted-foreground',
    in_progress: 'text-blue-400',
    review: 'text-amber-400',
    completed: 'text-slate-500',
    archived: 'text-gray-400',
    idle: 'text-muted-foreground',
    running: 'text-blue-400',
    error: 'text-red-400',
  };
  return colors[status] || 'text-muted-foreground';
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: '草稿',
    in_progress: '制作中',
    review: '审核中',
    completed: '已完成',
    archived: '已归档',
    idle: '空闲',
    running: '执行中',
    error: '失败',
    pending: '等待中',
    failed: '失败',
  };
  return labels[status] || status;
}
