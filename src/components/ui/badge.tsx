import type { ComponentProps } from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap transition-colors",
  {
    variants: {
      variant: {
        default: "bg-secondary text-secondary-foreground",
        blue: "bg-blue-500/12 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300",
        emerald: "bg-emerald-500/12 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300",
        amber: "bg-amber-500/14 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300",
        rose: "bg-rose-500/12 text-rose-600 dark:bg-rose-500/20 dark:text-rose-300",
        outline: "border border-border text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

export function Badge({
  className,
  variant,
  ...props
}: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
}
