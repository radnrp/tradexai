"use client";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { t } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { EmptyState, FlowHeader, Page } from "@/components/ui/primitives";

/** Unknown route or a stale deep link (design.md §9). */
export default function NotFound() {
  return (
    <Page nav={false}>
      <FlowHeader title={t("Not found")} />
      <div className="mt-6">
        <EmptyState
          icon={<Icon icon={Search01Icon} size={28} />}
          title={t("This page doesn't exist")}
          body={t("The link may be broken or outdated.")}
          action={
            <Button as="a" href="/">
              {t("Back to home")}
            </Button>
          }
        />
      </div>
    </Page>
  );
}
