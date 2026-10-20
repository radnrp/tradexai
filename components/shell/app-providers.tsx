"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { Toaster } from "sonner";
import { ApiError } from "@/lib/api/session";
import { BootGate } from "./boot-gate";

let browserClient: QueryClient | undefined;

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10_000,
        refetchOnWindowFocus: true,
        // Retry only transient failures; 4xx answers are final.
        retry: (count, e) => e instanceof ApiError && (e.status === 0 || e.status >= 500) && count < 2,
      },
      mutations: { retry: false },
    },
  });
}

function getClient() {
  if (typeof window === "undefined") return makeClient();
  return (browserClient ??= makeClient());
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const client = getClient();
  return (
    <QueryClientProvider client={client}>
      <MotionConfig reducedMotion="user" transition={{ type: "spring", stiffness: 420, damping: 36 }}>
        <BootGate>{children}</BootGate>
        {/* shadcn Sonner: transient, non-critical messages only; critical alerts are Dialogs */}
        <Toaster
          position="top-center"
          theme="dark"
          offset={16}
          style={
            {
              "--normal-bg": "var(--color-surface-raised)",
              "--normal-text": "var(--color-foreground)",
              "--normal-border": "var(--color-border)",
              "--border-radius": "var(--radius-md)",
            } as React.CSSProperties
          }
          toastOptions={{ classNames: { toast: "!font-sans", description: "!text-muted-foreground" } }}
        />
      </MotionConfig>
    </QueryClientProvider>
  );
}
