"use client";

import { FileSpreadsheet } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/** Downloads the list as an Excel file, with the filters currently on screen and every page, not just this one. */
export function ExportButton({ list, extra }: { list: string; extra?: Record<string, string> }) {
  const t = useTranslations("export");
  const params = new URLSearchParams(useSearchParams());
  params.delete("page");
  for (const [k, v] of Object.entries(extra ?? {})) params.set(k, v);
  const qs = params.toString();
  return (
    <Button asChild variant="secondary" size="sm">
      <a href={`/api/v1/exports/${list}${qs ? `?${qs}` : ""}`} download title={t("hint")}>
        <FileSpreadsheet /> {t("excel")}
      </a>
    </Button>
  );
}
