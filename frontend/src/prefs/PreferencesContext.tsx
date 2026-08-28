import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  savePreferences,
  type AppView,
  type Preferences,
  type ScrollMode,
  type ThemeMode,
} from '../storage/preferences';

type PreferencesContextValue = Preferences & {
  /** `theme` resolved against the OS setting, so callers never see 'system'. */
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: ThemeMode) => void;
  setScrollMode: (mode: ScrollMode) => void;
  setDrawerOpen: (open: boolean) => void;
  setDrawerWidth: (width: number) => void;
  setShowMinimap: (show: boolean) => void;
  setView: (view: AppView) => void;
};

const PreferencesContext = createContext<PreferencesContextValue | undefined>(undefined);

const DARK_QUERY = '(prefers-color-scheme: dark)';

function systemTheme(): 'light' | 'dark' {
  return window.matchMedia?.(DARK_QUERY).matches ? 'dark' : 'light';
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(() => {
    if (typeof window === 'undefined') {
      return DEFAULT_PREFERENCES;
    }
    return loadPreferences();
  });
  const [osTheme, setOsTheme] = useState<'light' | 'dark'>(() =>
    typeof window === 'undefined' ? 'light' : systemTheme(),
  );

  useEffect(() => {
    const media = window.matchMedia?.(DARK_QUERY);
    if (!media) {
      return;
    }
    const listener = () => setOsTheme(media.matches ? 'dark' : 'light');
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  const resolvedTheme = preferences.theme === 'system' ? osTheme : preferences.theme;

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolvedTheme;
    root.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  useEffect(() => {
    savePreferences(preferences);
  }, [preferences]);

  const patch = useCallback((changes: Partial<Preferences>) => {
    setPreferences((current) => ({ ...current, ...changes }));
  }, []);

  const setTheme = useCallback((theme: ThemeMode) => patch({ theme }), [patch]);
  const setScrollMode = useCallback((scrollMode: ScrollMode) => patch({ scrollMode }), [patch]);
  const setDrawerOpen = useCallback((drawerOpen: boolean) => patch({ drawerOpen }), [patch]);
  const setDrawerWidth = useCallback((drawerWidth: number) => patch({ drawerWidth }), [patch]);
  const setShowMinimap = useCallback((showMinimap: boolean) => patch({ showMinimap }), [patch]);
  const setView = useCallback((view: AppView) => patch({ view }), [patch]);

  const value = useMemo<PreferencesContextValue>(
    () => ({
      ...preferences,
      resolvedTheme,
      setTheme,
      setScrollMode,
      setDrawerOpen,
      setDrawerWidth,
      setShowMinimap,
      setView,
    }),
    [
      preferences,
      resolvedTheme,
      setTheme,
      setScrollMode,
      setDrawerOpen,
      setDrawerWidth,
      setShowMinimap,
      setView,
    ],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const context = useContext(PreferencesContext);
  if (context === undefined) {
    throw new Error('usePreferences must be used within a PreferencesProvider.');
  }
  return context;
}
