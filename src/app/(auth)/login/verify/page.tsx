import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { VerifyForm } from "./verify-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("meta"))("twoFactor") };
}

export default function VerifyPage() {
  return (
    <Suspense>
      <VerifyForm />
    </Suspense>
  );
}
