/**
 * Project rules that a reviewer shouldn't have to remember: they fail the build instead.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import ar from "../../messages/ar.json";
import en from "../../messages/en.json";
import { PERMISSIONS, ROLES } from "@/server/rbac/catalog";
import { safeNext } from "@/lib/safe-next";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}
const sources = walk("src").filter((f) => /\.tsx?$/.test(f));
const offenders = (pattern: RegExp, files = sources) =>
  files.flatMap((f) =>
    readFileSync(f, "utf8")
      .split("\n")
      .flatMap((line, i) => (pattern.test(line) ? [`${f}:${i + 1}: ${line.trim().slice(0, 100)}`] : [])),
  );

function keys(obj: object, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) => (typeof v === "object" ? keys(v as object, `${prefix}${k}.`) : [`${prefix}${k}`]));
}

describe("translations", () => {
  it("English and Arabic have exactly the same keys", () => {
    expect(keys(ar).sort()).toEqual(keys(en).sort());
  });
  it("no Arabic value is left untranslated", () => {
    const flat = (o: object, p = ""): [string, string][] => Object.entries(o).flatMap(([k, v]) => (typeof v === "object" ? flat(v as object, `${p}${k}.`) : [[`${p}${k}`, v as string]]));
    const allowedEnglish = ["palette.switchLanguage", "audit.ip"];
    const untranslated = flat(ar).filter(([k, v]) => !/[؀-ۿ]/.test(v) && !allowedEnglish.includes(k));
    expect(untranslated).toEqual([]);
  });
  it("every permission and role has labels in both languages", () => {
    for (const p of Object.keys(PERMISSIONS)) {
      expect(en.permissions).toHaveProperty([p]);
      expect(ar.permissions).toHaveProperty([p]);
    }
    for (const r of Object.keys(ROLES)) {
      expect(en.roles).toHaveProperty([r]);
      expect(ar.roles).toHaveProperty([r]);
      expect(ar.roleDescriptions).toHaveProperty([r]);
    }
  });
  it("every server-side message key exists", () => {
    const used = sources.flatMap((f) => [...readFileSync(f, "utf8").matchAll(/"((?:errors|validation)\.[a-zA-Z]+)"/g)].map((m) => m[1]));
    const available = new Set(keys(en));
    expect([...new Set(used)].filter((k) => !available.has(k))).toEqual([]);
  });
});

describe("RTL: logical properties only", () => {
  const ui = sources.filter((f) => f.endsWith(".tsx"));
  it("no physical Tailwind direction classes", () => {
    const physical = /["'`\s](?:[a-z-]+:)*(?:-?m[lr]-|p[lr]-|-?left-|-?right-|text-left|text-right|border-[lr]\b|border-[lr]-|rounded-[lr]-|rounded-[tb][lr]-|float-left|float-right)/;
    // inset-x / mx-auto are symmetrical and stay allowed; "top-left" prose doesn't appear in classes.
    expect(offenders(physical, ui)).toEqual([]);
  });
  it("no physical properties in the stylesheet", () => {
    const css = readFileSync("src/app/globals.css", "utf8").split("\n");
    const bad = css.filter((l) => /^\s*(margin|padding|border)-(left|right)\b|^\s*(left|right):/.test(l));
    expect(bad).toEqual([]);
  });
});

describe("no native pickers", () => {
  it("no <select> or date-like <input> anywhere", () => {
    expect(offenders(/<select\b|type=["'](date|datetime-local|month|week|time)["']/)).toEqual([]);
  });
});

describe("post-login redirect safety", () => {
  it.each([
    ["/admin/users", "/admin/users"],
    ["/admin/users?status=ACTIVE", "/admin/users?status=ACTIVE"],
    [null, "/"],
    ["", "/"],
    ["https://evil.example", "/"],
    ["//evil.example", "/"],
    ["/\\evil.example", "/"],
    ["/\t/evil.example", "/"],
  ])("%s → %s", (input, output) => {
    expect(safeNext(input)).toBe(output);
  });
});
