"use client";
import type { Lang } from "@/lib/i18n";
import { haptic } from "@/lib/telegram";
import { Button } from "@/components/ui/button";
import { useLanguage } from "./language";
import { Logo } from "./logo";

/** A first open from a campaign link: the user picks before entering, with nothing preselected. Sign-in carries on behind it. */
export function LanguagePicker() {
  const { choose } = useLanguage();
  const pick = (lang: Lang) => {
    haptic.select();
    choose(lang);
  };
  return (
    <main className="pt-safe pb-safe flex min-h-dvh flex-col items-center justify-center px-8 text-center">
      <Logo size={64} />
      <h1 className="mt-6 text-h1">Choose your language</h1> {/* i18n-ignore: this screen is in both languages */}
      <p lang="fa" dir="rtl" className="mt-1 text-h2">
        زبان خود را انتخاب کنید
      </p>
      <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
        <Button size="lg" variant="secondary" block onClick={() => pick("en")}>
          English
        </Button>
        <Button size="lg" variant="secondary" block onClick={() => pick("fa")}>
          <span lang="fa">فارسی</span>
        </Button>
      </div>
    </main>
  );
}
