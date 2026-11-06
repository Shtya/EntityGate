"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { changePasswordSchema, type ChangePasswordInput } from "@/server/modules/users/schema";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/misc";

export function PasswordPanel({ required }: { required?: boolean }) {
  const t = useTranslations();
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "" },
  });

  // Client-side messages are keys; messages from the API are already translated.
  const msg = (m?: string) => (m && t.has(m) ? t(m) : m);

  const onSubmit = handleSubmit(async (values) => {
    try {
      await api("/me/password", { method: "POST", json: values });
      reset();
      toast.success(t("security.passwordChanged"));
      router.refresh(); // re-runs the security gate in the layout
    } catch (e) {
      if (e instanceof ApiError && e.code === "VALIDATION") {
        const fields = e.fieldErrors();
        if (fields.newPassword) setError("newPassword", { message: fields.newPassword });
        else setError("currentPassword", { message: e.message });
      } else toast.error(e instanceof ApiError ? e.message : t("security.changeFailed"));
    }
  });

  return (
    <Panel>
      <div className="flex items-start gap-4 p-5">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
          <KeyRound className="size-5" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{t("security.passwordTitle")}</h2>
          <p className="mt-1 text-sm text-muted">
            {t(required ? "security.passwordBodyRequired" : "security.passwordBody")}
          </p>
        </div>
      </div>
      <form onSubmit={onSubmit} noValidate className="grid gap-4 border-t border-border p-5">
        <Field label={t(required ? "security.temporaryPassword" : "security.currentPassword")} htmlFor="currentPassword" error={msg(errors.currentPassword?.message)}>
          <Input id="currentPassword" type="password" autoComplete="current-password" aria-invalid={!!errors.currentPassword} {...register("currentPassword")} />
        </Field>
        <Field label={t("security.newPassword")} htmlFor="newPassword" hint={t("security.newPasswordHint")} error={msg(errors.newPassword?.message)}>
          <Input id="newPassword" type="password" autoComplete="new-password" aria-invalid={!!errors.newPassword} {...register("newPassword")} />
        </Field>
        <div className="flex justify-end">
          <Button type="submit" loading={isSubmitting}>
            {t("security.changePassword")}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
