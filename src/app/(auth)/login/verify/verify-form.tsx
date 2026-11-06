"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { safeNext } from "@/lib/safe-next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, Label } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { CodeInput } from "@/components/patterns/code-input";

export function VerifyForm() {
  const t = useTranslations("verify");
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<"totp" | "backup">("totp");
  const [code, setCode] = useState("");
  const [trust, setTrust] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(value = code) {
    setBusy(true);
    setError(null);
    const res =
      mode === "totp"
        ? await authClient.twoFactor.verifyTotp({ code: value, trustDevice: trust })
        : await authClient.twoFactor.verifyBackupCode({ code: value.trim(), trustDevice: trust });
    setBusy(false);
    if (res.error) {
      setError(res.error.status === 429 ? "tooMany" : "invalid");
      setCode("");
      return;
    }
    router.replace(safeNext(params.get("next")));
    router.refresh();
  }

  return (
    <>
      <div className="mb-6 grid gap-1.5">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">{t("title")}</h1>
        <p className="text-sm text-muted">{t(mode === "totp" ? "totpHint" : "backupHint")}</p>
      </div>
      <form
        className="grid gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {mode === "totp" ? (
          <CodeInput value={code} onChange={setCode} onComplete={(v) => void submit(v)} disabled={busy} invalid={!!error} />
        ) : (
          <Field label={t("backupCode")} htmlFor="backup">
            <Input id="backup" dir="ltr" autoFocus className="h-10 font-mono" value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
        )}
        <div className="flex items-center gap-2">
          <Checkbox id="trust" checked={trust} onCheckedChange={(v) => setTrust(v === true)} />
          <Label htmlFor="trust" className="font-normal text-muted">
            {t("trust")}
          </Label>
        </div>
        {error && (
          <p role="alert" className="animate-fade-in rounded-md border border-danger/25 bg-danger-soft px-3 py-2 text-sm text-danger">
            {t(error)}
          </p>
        )}
        <Button type="submit" size="lg" loading={busy} disabled={mode === "totp" ? code.length !== 6 : !code.trim()}>
          {t("submit")}
        </Button>
        <button
          type="button"
          className="text-center text-xs text-muted hover:text-fg"
          onClick={() => {
            setMode((m) => (m === "totp" ? "backup" : "totp"));
            setCode("");
            setError(null);
          }}
        >
          {t(mode === "totp" ? "useBackup" : "useTotp")}
        </button>
      </form>
    </>
  );
}
