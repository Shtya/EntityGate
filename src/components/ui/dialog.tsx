"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Dialog as D } from "radix-ui";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

function Overlay() {
  return <D.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />;
}

function CloseButton({ className }: { className?: string }) {
  const t = useTranslations("common");
  return (
    <D.Close className={cn("grid size-7 shrink-0 place-items-center rounded-md text-muted hover:bg-surface-3/70 hover:text-fg", className)} aria-label={t("close")}>
      <X className="size-4" strokeWidth={1.75} />
    </D.Close>
  );
}

export function DialogContent({
  title,
  description,
  className,
  children,
  wide,
}: {
  title: string;
  description?: string;
  className?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <D.Portal>
      <Overlay />
      <D.Content
        className={cn(
          "glass fixed inset-x-0 top-[10vh] z-50 mx-auto w-[calc(100vw-32px)] rounded-lg",
          "data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in",
          wide ? "max-w-2xl" : "max-w-md",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border-card px-5 py-4">
          <div className="grid gap-0.5">
            <D.Title className="text-base font-semibold tracking-[-0.01em]">{title}</D.Title>
            <D.Description className={description ? "text-sm text-muted" : "sr-only"}>{description ?? title}</D.Description>
          </div>
          <CloseButton className="-me-1" />
        </div>
        {children}
      </D.Content>
    </D.Portal>
  );
}

export function DialogBody({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("scroll-thin grid gap-4 px-5 py-4", className)} {...p} />;
}

export function DialogFooter({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center justify-end gap-2 border-t border-border-card px-5 py-3", className)} {...p} />;
}

/** Side sheet for record details: keeps the list in view behind it. */
export function SheetContent({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <D.Portal>
      <Overlay />
      <D.Content
        className={cn(
          "glass fixed inset-y-0 end-0 z-50 flex w-full max-w-[520px] flex-col",
          "data-[state=closed]:animate-sheet-out data-[state=open]:animate-sheet-in",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border-card px-6 py-4">
          <div className="grid min-w-0 gap-0.5">
            <D.Title className="truncate text-base font-semibold">{title}</D.Title>
            <D.Description className={description ? "truncate text-sm text-muted" : "sr-only"}>
              <bdi>{description ?? title}</bdi>
            </D.Description>
          </div>
          <CloseButton className="-me-2" />
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">{children}</div>
      </D.Content>
    </D.Portal>
  );
}
