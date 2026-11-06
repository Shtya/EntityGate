"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { ErrorState } from "@/components/patterns/states";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <ErrorState
      className="flex-1"
      title={t("states.errorTitle")}
      description={error.digest ? t("states.errorRef", { ref: error.digest }) : t("states.errorBody")}
      action={
        <Button variant="secondary" onClick={reset}>
          {t("common.tryAgain")}
        </Button>
      }
    />
  );
}
