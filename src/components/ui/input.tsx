import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export const inputBase = [
  "w-full rounded-md border border-border-strong bg-surface px-2.5 text-sm text-fg",
  "placeholder:text-faint transition-[border-color,box-shadow] duration-150",
  "hover:border-[color-mix(in_oklab,var(--border-strong),var(--text)_15%)]",
  "focus:border-primary focus:outline-none focus:ring-3 focus:ring-primary/15",
  "disabled:cursor-not-allowed disabled:opacity-60",
  "aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/15",
].join(" ");

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(inputBase, "h-8", className)} {...props} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(inputBase, "min-h-20 py-2 leading-relaxed", className)} {...props} />;
  },
);
