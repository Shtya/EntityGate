import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("meta"))("signIn") };
}

export default async function LoginPage() {
  const t = await getTranslations("login");
  return (
    <>
      <div className="mb-6 grid gap-1.5">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">{t("title")}</h1>
        <p className="text-sm text-muted">{t("subtitle")}</p>
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
    </>
  );
}
