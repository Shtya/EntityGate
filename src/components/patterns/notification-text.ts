type Translator = { (key: string, values?: Record<string, string | number>): string; has: (key: string) => boolean };

/** Notifications store a message key and parameters, so each reader sees their own language. */
export function notificationText(t: Translator, title: string, body: string | null): string {
  let params: Record<string, string | number> = {};
  try {
    params = body ? JSON.parse(body) : {};
  } catch {}
  if (title === "notif.escalated" && typeof params.inner === "string") {
    return t("notif.escalated", { text: notificationText(t, params.inner, typeof params.params === "string" ? params.params : null) });
  }
  if (typeof params.doc === "string" && t.has(`enums.DocumentType.${params.doc}`)) params = { ...params, doc: t(`enums.DocumentType.${params.doc}`) };
  return t.has(title) ? t(title, params) : title;
}
