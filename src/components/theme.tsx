"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Theme = "light" | "dark";
const ThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({
  theme: "light",
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    try {
      if (localStorage.getItem("eg-theme") === "dark") setThemeState("dark");
    } catch {}
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try {
      localStorage.setItem("eg-theme", t);
    } catch {}
    document.documentElement.classList.toggle("dark", t === "dark");
  }, []);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
