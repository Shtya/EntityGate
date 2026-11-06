import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { Spinner } from "./spinner";

const buttonVariants = cva(
  [
    "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-medium",
    "transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-[var(--ease-out-quint)]",
    "active:translate-y-px disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:stroke-[1.75]",
  ],
  {
    variants: {
      variant: {
        primary: "bg-primary text-on-primary shadow-[inset_0_1px_0_rgb(255_255_255/0.08)] hover:bg-primary-hover",
        secondary: "border border-border-strong bg-surface text-fg hover:bg-surface-2",
        ghost: "text-muted hover:bg-surface-2 hover:text-fg",
        danger: "bg-danger text-white hover:brightness-110",
        link: "h-auto px-0 text-primary underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-7 rounded-md px-2.5 text-xs",
        md: "h-8 rounded-md px-3 text-sm",
        lg: "h-10 rounded-md px-4 text-base",
        icon: "size-8 rounded-md",
        "icon-sm": "size-7 rounded-md [&_svg]:size-3.5",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild, loading, disabled, children, ...props },
  ref,
) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading && (
            <span className="absolute inset-0 grid place-items-center">
              <Spinner />
            </span>
          )}
          <span className={cn("inline-flex items-center gap-2", loading && "invisible")}>{children}</span>
        </>
      )}
    </Comp>
  );
});

export { buttonVariants };
