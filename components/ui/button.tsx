import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition disabled:pointer-events-none disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--teal)]",
  {
    variants: {
      variant: {
        default: "bg-[var(--ink)] text-[var(--paper)] hover:bg-[#2a261f]",
        teal: "bg-[var(--teal)] text-white hover:bg-[#0b574f]",
        ghost: "bg-transparent text-[var(--ink)] hover:bg-black/5",
        danger: "bg-[#9f1239] text-white hover:bg-[#881337]",
        outline: "border border-[var(--line)] bg-white/70 hover:bg-white",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 px-3 text-xs",
        lg: "h-12 px-5",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
