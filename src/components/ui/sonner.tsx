import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { useThemeStore } from "@/stores/theme-store"

const Toaster = ({ ...props }: ToasterProps) => {
  // 项目主题由 theme-store 直接切换 html.dark，没有 next-themes 的 Provider。
  // 提示组件直接读取界面主题状态。
  const theme = useThemeStore((s) => s.theme)

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          // index.css 里的语义变量是 HSL 分量（如 "0 0% 5%"），
          // 必须包一层 hsl() 才是合法的 CSS 颜色。
          "--normal-bg": "hsl(var(--popover))",
          "--normal-text": "hsl(var(--popover-foreground))",
          "--normal-border": "hsl(var(--border))",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
