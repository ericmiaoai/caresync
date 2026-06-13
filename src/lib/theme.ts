export type Theme = "black" | "gray" | "light" | "ocean" | "sandstone" | "sunset" | "granite";

const STORAGE_KEY = "caresync-theme";

// Old theme ids that may still be saved in localStorage or Supabase prefs
const LEGACY_THEME_ALIASES: Record<string, Theme> = {
  blue: "ocean",
  periwinkle: "ocean",
  indigo: "sunset",
};

export const THEMES: { id: Theme; label: string }[] = [
  { id: "black",      label: "Black"      },
  { id: "gray",       label: "Gray"       },
  { id: "light",      label: "Light"      },
  { id: "ocean",      label: "Ocean"      },
  { id: "sandstone",  label: "Sandstone"  },
  { id: "sunset",     label: "Sunset"     },
  { id: "granite",    label: "Granite"    },
];

const VALID_THEMES = new Set<string>(THEMES.map((t) => t.id));

export function normalizeTheme(value: string | null | undefined): Theme | null {
  if (!value) return null;
  if (VALID_THEMES.has(value)) return value as Theme;
  return LEGACY_THEME_ALIASES[value] ?? null;
}

export function getStoredTheme(): Theme {
  try {
    const normalized = normalizeTheme(localStorage.getItem(STORAGE_KEY));
    if (normalized) return normalized;
  } catch { /* SSR / privacy mode */ }
  return "granite";
}

export function applyTheme(theme: Theme) {
  const html = document.documentElement;
  html.setAttribute("data-theme", theme);
  if (theme === "light" || theme === "ocean" || theme === "sunset") {
    html.classList.remove("dark");
  } else {
    html.classList.add("dark");
  }
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch { /* ignore */ }
}
