"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Direction, Tooltip } from "radix-ui";
import { useState } from "react";
import { Toaster } from "sonner";
import { ThemeProvider } from "./theme";

export function Providers({ direction, children }: { direction: "ltr" | "rtl"; children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
        },
      }),
  );
  return (
    <ThemeProvider>
      <QueryClientProvider client={client}>
        <Direction.Provider dir={direction}>
          <Tooltip.Provider delayDuration={250} skipDelayDuration={100}>
            {children}
            <Toaster
              dir={direction}
              position={direction === "rtl" ? "bottom-left" : "bottom-right"}
              gap={8}
              toastOptions={{
                unstyled: true,
                classNames: {
                  toast: "glass flex w-[360px] max-w-[calc(100vw-32px)] items-start gap-3 rounded-lg px-4 py-3 text-sm text-fg",
                  title: "font-medium",
                  description: "text-muted",
                  error: "[&_[data-icon]]:text-danger",
                  success: "[&_[data-icon]]:text-success",
                },
              }}
            />
          </Tooltip.Provider>
        </Direction.Provider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
