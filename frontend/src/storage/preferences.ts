export type ThemeMode = 'light' | 'dark' | 'system';

/** Whether a bare wheel gesture zooms the canvas or pans it (Figma-style). */
export type ScrollMode = 'zoom' | 'pan';

export type AppView = 'canvas' | 'watts';

export type Preferences = {
  theme: ThemeMode;
  scrollMode: ScrollMode;
  drawerOpen: boolean;
  drawerWidth: number;
  showMinimap: boolean;
  view: AppView;
};

// Kept in sync with the inline bootstrap script in index.html, which reads the
// same key to set data-theme before React mounts and avoid a flash.
export const PREFERENCES_STORAGE_KEY = 'xscout.prefs.v1';

export const DRAWER_MIN_WIDTH = 248;
export const DRAWER_MAX_WIDTH = 520;

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'system',
  scrollMode: 'zoom',
  drawerOpen: true,
  drawerWidth: 304,
  showMinimap: true,
  view: 'canvas',
};

function clampDrawerWidth(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_PREFERENCES.drawerWidth;
  }
  return Math.min(DRAWER_MAX_WIDTH, Math.max(DRAWER_MIN_WIDTH, Math.round(value)));
}

export function loadPreferences(): Preferences {
  try {
    const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_PREFERENCES;
    }
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return {
      theme:
        parsed.theme === 'light' || parsed.theme === 'dark' || parsed.theme === 'system'
          ? parsed.theme
          : DEFAULT_PREFERENCES.theme,
      scrollMode: parsed.scrollMode === 'pan' ? 'pan' : 'zoom',
      drawerOpen: typeof parsed.drawerOpen === 'boolean' ? parsed.drawerOpen : true,
      drawerWidth: clampDrawerWidth(parsed.drawerWidth),
      showMinimap: typeof parsed.showMinimap === 'boolean' ? parsed.showMinimap : true,
      view: parsed.view === 'watts' ? 'watts' : 'canvas',
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function savePreferences(preferences: Preferences): void {
  try {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Private-browsing quota errors must not break the canvas.
  }
}
