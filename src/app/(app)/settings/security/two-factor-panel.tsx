"use client";

import { Check, Copy, ShieldCheck, Smartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import QRCode from "react-qr-code";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Badge, Panel } from "@/components/ui/misc";
import { CodeInput } from "@/components/patterns/code-input";

type Step = { kind: "idle" } | { kind: "password" } | { kind: "scan"; uri: string; backupCodes: string[] } | { kind: "codes"; backupCodes: string[] };

export function TwoFactorPanel({ enabled, required }: { enabled: boolean; required: boolean }) {
  const t = useTranslations("security");
  const tc = useTranslations("common");
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);

  async function start() {
    setBusy(true);
    setError(null);
    const { data, error } = await authClient.twoFactor.enable({ password });
    setBusy(false);
    if (error || !data || data.method !== "totp") {
      setError(t(error?.status === 400 || error?.status === 401 ? "wrongPassword" : "startFailed"));
      return;
    }
    setPassword("");
    setStep({ kind: "scan", uri: data.totpURI, backupCodes: data.backupCodes });
  }

  async function confirm(value = code) {
    if (step.kind !== "scan") return;
    setBusy(true);
    setError(null);
    const { error } = await authClient.twoFactor.verifyTotp({ code: value });
    setBusy(false);
    if (error) {
      setError(t("codeMismatch"));
      setCode("");
      return;
    }
    setStep({ kind: "codes", backupCodes: step.backupCodes });
  }

  async function disable() {
    setBusy(true);
    setError(null);
    const { error } = await authClient.twoFactor.disable({ password });
    setBusy(false);
    if (error) {
      setError(t("wrongPassword"));
      return;
    }
    setDisableOpen(false);
    setPassword("");
    toast.success(t("turnedOff"));
    router.refresh();
  }

  const secret = step.kind === "scan" ? new URL(step.uri).searchParams.get("secret") : null;

  return (
    <Panel>
      <div className="flex items-start gap-4 p-5">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
          <Smartphone className="size-5" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">{t("appTitle")}</h2>
            {enabled ? (
              <Badge tone="success" dot>
                {t("on")}
              </Badge>
            ) : (
              <Badge tone={required ? "warning" : "neutral"}>{t(required ? "required" : "off")}</Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted">
            {t("appBody")}
          </p>
        </div>
        {step.kind === "idle" &&
          (enabled ? (
            !required && (
              <Button variant="secondary" onClick={() => setDisableOpen(true)}>
                {t("turnOff")}
              </Button>
            )
          ) : (
            <Button onClick={() => setStep({ kind: "password" })}>{t("setUp")}</Button>
          ))}
      </div>

      {step.kind === "password" && (
        <form
          className="grid gap-4 border-t border-border p-5"
          onSubmit={(e) => {
            e.preventDefault();
            void start();
          }}
        >
          <Field label={t("confirmPassword")} htmlFor="pw" error={error ?? undefined}>
            <Input id="pw" type="password" autoComplete="current-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setStep({ kind: "idle" })}>
              {tc("cancel")}
            </Button>
            <Button type="submit" loading={busy} disabled={!password}>
              {tc("continue")}
            </Button>
          </div>
        </form>
      )}

      {step.kind === "scan" && (
        <div className="grid gap-6 border-t border-border p-5 sm:grid-cols-[176px_minmax(0,1fr)]">
          <div className="grid place-items-center rounded-md border border-border bg-white p-3">
            <QRCode value={step.uri} size={150} fgColor="#14171c" />
          </div>
          <div className="grid content-start gap-4">
            <ol className="grid gap-1.5 text-sm text-muted">
              <li>{t("step1")}</li>
              <li>{t("step2")}</li>
            </ol>
            {secret && (
              <p className="text-xs text-faint">
                {t("manualKey")} <bdi className="select-all break-all font-mono text-fg">{secret}</bdi>
              </p>
            )}
            <CodeInput value={code} onChange={setCode} onComplete={(v) => void confirm(v)} disabled={busy} invalid={!!error} />
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setStep({ kind: "idle" })}>
                {tc("cancel")}
              </Button>
              <Button loading={busy} disabled={code.length !== 6} onClick={() => void confirm()}>
                {t("verifyOn")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {step.kind === "codes" && <BackupCodes codes={step.backupCodes} onDone={() => {
            setStep({ kind: "idle" });
            router.refresh(); // layouts persist across navigation; re-run the 2FA gate
          }} />}

      <Dialog open={disableOpen} onOpenChange={setDisableOpen}>
        <DialogContent title={t("turnOffTitle")} description={t("turnOffBody")}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void disable();
            }}
          >
            <DialogBody>
              <Field label={t("passwordTitle")} htmlFor="pw-off" error={error ?? undefined}>
                <Input id="pw-off" type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setDisableOpen(false)}>
                {tc("cancel")}
              </Button>
              <Button type="submit" variant="danger" loading={busy} disabled={!password}>
                {t("turnOff")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

function BackupCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const t = useTranslations("security");
  const tc = useTranslations("common");
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-4 border-t border-border p-5">
      <div className="flex items-center gap-2 text-sm font-medium text-success">
        <ShieldCheck className="size-4" /> {t("isOn")}
      </div>
      <p className="text-sm text-muted">
        {t("backupBody")}
      </p>
      <div dir="ltr" className="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-md bg-surface-2 p-4 font-mono text-sm sm:grid-cols-3">
        {codes.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <Button
          variant="secondary"
          onClick={async () => {
            await navigator.clipboard.writeText(codes.join("\n"));
            setCopied(true);
          }}
        >
          {copied ? <Check /> : <Copy />} {copied ? tc("copied") : t("copyCodes")}
        </Button>
        <Button onClick={onDone}>{t("savedCodes")}</Button>
      </div>
    </div>
  );
}
