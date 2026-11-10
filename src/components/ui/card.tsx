import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn("vibe-card flex flex-col gap-3 p-5", className)}
      {...props}
    />
  )
}
