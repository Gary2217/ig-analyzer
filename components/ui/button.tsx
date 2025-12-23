import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all motion-safe:duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-lg active:translate-y-0 select-none disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:ring-2 focus-visible:ring-white/30 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        primary:
          "bg-gradient-to-r from-blue-500 to-fuchsia-500 text-white shadow-md shadow-fuchsia-500/20 hover:brightness-110 hover:shadow-lg",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
        secondary:
          "bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow-md shadow-cyan-500/30 hover:from-sky-400 hover:to-cyan-400 hover:shadow-lg hover:shadow-cyan-400/40 active:scale-[0.99]",
        "secondary-solid":
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        "secondary-soft":
          "bg-white/5 text-white border border-white/10 hover:bg-white/10 hover:border-white/20",
        pill:
          "bg-black/20 text-white/60 border border-white/10 hover:bg-black/30 hover:text-white/70 motion-safe:hover:shadow-none motion-safe:hover:translate-y-0 shadow-none",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        "lg-cta": "h-12 w-full rounded-xl px-5 text-sm",
        md: "h-11 rounded-xl px-5 text-sm",
        pill: "h-9 rounded-full px-4 text-xs",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
      active: {
        true: "",
        false: "",
      },
      platform: {
        instagram: "",
        threads: "",
      },
    },
    compoundVariants: [
      {
        variant: "pill",
        active: true,
        className:
          "bg-black/60 text-white border-white/30 font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] hover:bg-black/65",
      },
      {
        variant: "pill",
        active: true,
        platform: "instagram",
        className: "border-white/35",
      },
      {
        variant: "pill",
        active: true,
        platform: "threads",
        className: "border-white/25",
      },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
      active: false,
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  active = false,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    active?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-active={active ? "true" : "false"}
      className={cn(buttonVariants({ variant, size, active, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
