import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * 项目统一内容卡片。
 *
 * 模板库、技能库、素材库、产物库的卡片共用这一套结构：
 * 顶部标识 / 媒体 → 标题 → 描述 → 标签 → 底部元信息与操作。
 * 卡片内部不再各自拼接上下结构，配色只使用语义令牌。
 */

export interface CardTagItem {
  label: React.ReactNode;
  icon?: React.ReactNode;
  key?: string | number;
}

export function CardTag({ children, icon, className }: {
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground',
      className,
    )}>
      {icon}
      {children}
    </span>
  );
}

export interface EntityCardProps {
  /** 顶部标识，一行，如「官方精选」 */
  eyebrow?: React.ReactNode;
  /** 媒体/预览区，放在标识与标题之间 */
  media?: React.ReactNode;
  /** 使用 children 自定义内部结构时可不传 */
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** 统一标签行；超过上限由组件截断并补计数 */
  tags?: CardTagItem[];
  maxTags?: number;
  /** 底部左侧元信息 */
  meta?: React.ReactNode;
  /** 底部右侧操作区，点击不会触发卡片 onClick */
  action?: React.ReactNode;
  onClick?: () => void;
  /** 媒体卡片：媒体区为正方形，标题与描述更紧凑 */
  mediaCard?: boolean;
  /** 传入时只复用卡片外壳，内部由调用方排布（媒体型卡片） */
  children?: React.ReactNode;
  className?: string;
}

export function EntityCard({
  eyebrow,
  media,
  title,
  description,
  tags,
  maxTags = 6,
  meta,
  action,
  onClick,
  mediaCard = false,
  children,
  className,
}: EntityCardProps) {
  const visibleTags = tags?.slice(0, maxTags) ?? [];
  const hiddenCount = (tags?.length ?? 0) - visibleTags.length;

  return (
    <div
      data-slot="entity-card"
      onClick={onClick}
      className={cn(
        'group relative flex flex-col rounded-2xl border border-border/70 bg-card p-4 shadow-sm',
        'transition-colors hover:border-foreground/20 hover:shadow-md',
        onClick && 'cursor-pointer',
        className,
      )}
    >
      {children ?? (
        <>
      {eyebrow && (
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground mb-2">
          {eyebrow}
        </div>
      )}

      {media && (
        <div className={cn(
          'mb-3 overflow-hidden rounded-xl bg-muted/40 flex items-center justify-center',
          mediaCard ? 'aspect-square' : 'min-h-[72px]',
        )}>
          {media}
        </div>
      )}

      <h3 className={cn(
        'font-semibold text-foreground leading-snug',
        mediaCard ? 'text-[12px]' : 'text-[14px]',
      )}>
        {title}
      </h3>

      {description && (
        <p className={cn(
          'mt-1.5 text-muted-foreground leading-relaxed line-clamp-2',
          mediaCard ? 'text-[11px]' : 'text-[12px]',
        )}>
          {description}
        </p>
      )}

      {visibleTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {visibleTags.map((tag, i) => (
            <CardTag key={tag.key ?? i} icon={tag.icon}>{tag.label}</CardTag>
          ))}
          {hiddenCount > 0 && <CardTag>+{hiddenCount}</CardTag>}
        </div>
      )}

      {(meta || action) && (
        <div className="mt-auto pt-3 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-2 min-w-0 truncate">{meta}</div>
          {action && (
            <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
              {action}
            </div>
          )}
        </div>
      )}
        </>
      )}
    </div>
  );
}
