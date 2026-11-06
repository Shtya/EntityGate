"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { authClient } from "@/lib/auth-client";
import { safeNext } from "@/lib/safe-next";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const schema = z.object({
  email: z.email("validation.emailInvalid"),
  password: z.string().min(1, "validation.passwordRequired"),
});
type Values = z.infer<typeof schema>;

export function LoginForm() {
  const t = useTranslations();
  const router = useRouter();
  const params = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [show, setShow] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const fail = (key: string) => {
    setFormError(key);
    setAttempt((n) => n + 1); // restarts the shake
  };

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const { data, error } = await authClient.signIn.email({ email: values.email, password: values.password });
    if (error) {
      if (error.status === 429) fail("login.tooMany");
      else if (error.status === 401 || error.code === "INVALID_EMAIL_OR_PASSWORD") fail("login.invalid");
      else fail("login.failed");
      return;
    }
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) return; // client plugin redirects
    router.replace(safeNext(params.get("next")));
    router.refresh();
  });

  return (
    <form key={attempt} onSubmit={onSubmit} noValidate className={cn("grid gap-4", attempt > 0 && formError && "animate-shake")}>
      <Field label={t("login.email")} htmlFor="email" error={errors.email?.message && t(errors.email.message)}>
        <Input id="email" type="email" dir="ltr" autoComplete="username" autoFocus className="h-10" aria-invalid={!!errors.email} {...register("email")} />
      </Field>
      <Field label={t("login.password")} htmlFor="password" error={errors.password?.message && t(errors.password.message)}>
        <div className="relative">
          <Input
            id="password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            className="h-10 pe-10"
            aria-invalid={!!errors.password}
            {...register("password")}
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute inset-y-0 end-0 grid w-10 place-items-center text-faint hover:text-fg"
            aria-label={t(show ? "login.hidePassword" : "login.showPassword")}
            aria-pressed={show}
          >
            {show ? <EyeOff className="size-4" strokeWidth={1.75} /> : <Eye className="size-4" strokeWidth={1.75} />}
          </button>
        </div>
      </Field>
      {formError && (
        <p role="alert" className="animate-fade-in rounded-md border border-danger/25 bg-danger-soft px-3 py-2 text-sm text-danger">
          {t(formError)}
        </p>
      )}
      <Button type="submit" size="lg" loading={isSubmitting} className="mt-2 w-full">
        {t("login.submit")}
      </Button>
      <p className="text-center text-xs text-muted">{t("login.forgot")}</p>
    </form>
  );
}
