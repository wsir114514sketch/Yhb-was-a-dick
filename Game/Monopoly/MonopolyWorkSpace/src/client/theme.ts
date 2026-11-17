/**
 * Theme selection, using the same mechanism and the same storage key shape as the other LayUDown clients.
 *
 * `data-theme` on the root element is what `tokens.css` switches on, so the theme is one attribute and every surface
 * follows. `auto` removes the attribute entirely and lets the system preference in the stylesheet take over — the same
 * arrangement UNO uses, so a player who has chosen "跟随系统" gets the same result in both games.
 */

export type ThemeMode = "auto" | "light" | "dark";

const THEME_KEY = "monopoly.theme";

export function readThemeMode(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === "light" || saved === "dark" ? saved : "auto";
  } catch {
    return "auto";
  }
}

function applyTheme(mode: ThemeMode): void {
  if (mode === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = mode;
  // Keep the browser chrome on the page colour, which is what makes a phone feel like an app rather than a page.
  const light = mode === "light"
    || (mode === "auto" && window.matchMedia("(prefers-color-scheme: light)").matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", light ? "#f6f7f9" : "#101112");
}

export function setThemeMode(mode: ThemeMode): void {
  try {
    if (mode === "auto") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, mode);
  } catch {
    // The in-memory choice still applies for this session when storage is unavailable.
  }
  applyTheme(mode);
}

/** Applies the saved theme, and follows the system while the choice is `auto`. Call once at startup. */
export function initializeTheme(): void {
  applyTheme(readThemeMode());
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (readThemeMode() === "auto") applyTheme("auto");
  });
}