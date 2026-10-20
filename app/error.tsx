"use client";
import { useEffect } from "react";
import { Refresh01Icon } from "@hugeicons/core-free-icons";
import { Logo } from "@/components/shell/logo";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

/**
 * Any render crash lands here instead of a blank WebView. "Reload" fetches fresh code, which is what fixes a stale or
 * half-updated bundle; "Try again" just re-renders the screen.
 */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="pt-safe pb-safe flex min-h-dvh flex-col items-center justify-center px-8 text-center">
      <Logo size={56} />
      <h1 className="mt-6 text-h1">Something went wrong</h1>
      <p className="mt-2 max-w-xs text-body-sm text-muted-foreground">Reload the app to get the latest version. Your money and trades aren&apos;t affected.</p>
      <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
        <Button size="lg" block icon={<Icon icon={Refresh01Icon} size={18} />} onClick={() => window.location.reload()}>
          Reload
        </Button>
        <Button size="lg" variant="secondary" block onClick={reset}>
          Try again
        </Button>
      </div>
      {error.digest && <p className="mt-6 font-mono text-caption text-subtle">Ref {error.digest}</p>}
    </main>
  );
}
