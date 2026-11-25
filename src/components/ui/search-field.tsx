import * as React from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * 列表页搜索框（L2 复合组件）。
 *
 * 与 L1 表单输入框有意采用不同规范：表单输入嵌在有边界的卡片里，
 * 用背景填充即可；搜索框独立置于页面顶部，必须有可见边界与图标，
 * 否则在浅色背景上无法辨认。两者不共用同一套边框规则。
 */
export interface SearchFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'onChange' | 'value'> {
  value: string;
  onValueChange: (value: string) => void;
  size?: 'sm' | 'md';
  /** page：列表页顶部；sidebar：侧栏内，与侧栏底色融合 */
  variant?: 'page' | 'sidebar';
  containerClassName?: string;
}

export function SearchField({
  value,
  onValueChange,
  size = 'md',
  variant = 'page',
  placeholder = '搜索...',
  className,
  containerClassName,
  ...props
}: SearchFieldProps) {
  return (
    <div className={cn('relative flex items-center', containerClassName)}>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={placeholder}
        aria-label={typeof placeholder === 'string' ? placeholder : '搜索'}
        className={cn(
          'w-full rounded-lg border text-foreground outline-none transition-colors focus-visible:shadow-none focus-visible:ring-0',
          'pl-8 pr-8 placeholder:text-muted-foreground/80',
          variant === 'sidebar'
            ? 'border-transparent bg-muted/50 hover:bg-muted focus-visible:bg-muted/70'
            : 'border-border bg-background hover:bg-muted/30 focus-visible:bg-muted/20',
          'disabled:cursor-not-allowed disabled:opacity-50',
          '[&::-webkit-search-cancel-button]:hidden',
          size === 'sm' ? 'h-8 text-[12px]' : 'h-9 text-[13px]',
          className,
        )}
        {...props}
      />
      {value && (
        <button
          type="button"
          onClick={() => onValueChange('')}
          aria-label="清除搜索"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
