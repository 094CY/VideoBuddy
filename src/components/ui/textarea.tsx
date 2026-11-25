import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "placeholder:text-muted-foreground flex field-sizing-content min-h-16 w-full rounded-lg border-0 bg-muted/60 px-3 py-2 text-sm shadow-none transition-colors outline-none",
        "hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring/15",
        "aria-invalid:ring-2 aria-invalid:ring-destructive/25",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
