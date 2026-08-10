"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect } from "react";

import { usePreferences, type ThemeChoice } from "@/lib/stores/preferences";
import { cn } from "@/lib/utils/cn";

/**
 * Theme control.
 *
 * Dark mode here is a designed system rather than an inversion, so the choice
 * matters enough to be a first-class control rather than buried in settings.
 * The stored value is applied by an inline script before first paint; this
 * component keeps the document in sync afterwards, including when the system
 * preference changes while the tab is open.
 */

const OPTIONS: ReadonlyArray<{ value: ThemeChoice; label: string; Icon: typeof Sun }> = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

function apply(theme: ThemeChoice): void {
  const dark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

export function useThemeSync(): void {
  const theme = usePreferences((store) => store.theme);

  useEffect(() => {
    apply(theme);
    if (theme !== "system") return;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);
}

export function ThemeToggle({ className }: { className?: string }) {
  const theme = usePreferences((store) => store.theme);
  const setTheme = usePreferences((store) => store.setTheme);

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={cn(
        "flex items-center gap-0.5 rounded-md border border-hairline p-0.5",
        className,
      )}
    >
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          aria-label={label}
          title={label}
          onClick={() => setTheme(value)}
          className={cn(
            "flex size-8 cursor-pointer items-center justify-center rounded-sm transition-colors duration-[--duration-fast]",
            theme === value
              ? "bg-primary text-inverse"
              : "text-tertiary hover:bg-[--surface-hover] hover:text-primary",
          )}
        >
          <Icon className="size-4" aria-hidden />
        </button>
      ))}
    </div>
  );
}
