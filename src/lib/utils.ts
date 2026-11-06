import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((p) => p && !/^(al|el|bin|ibn)-?$/i.test(p))
    .map((p) => p.replace(/^(al|el)-/i, ""))
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/** Compress expanded IPv6 for display (Better Auth stores the full form). IPv4 passes through. */
export function shortIp(ip: string | null | undefined): string {
  if (!ip) return "—";
  if (!ip.includes(":")) return ip;
  const compact = ip
    .toLowerCase()
    .split(":")
    .map((group) => group.replace(/^0+(?=.)/, ""))
    .join(":");
  return compact.replace(/(^|:)0(:0)+(:|$)/, () => "::");
}
