import { memo, type ReactNode } from 'react';
import { usePreferences } from '../prefs/PreferencesContext';
import type { ScrollMode, ThemeMode } from '../storage/preferences';
import {
  MonitorIcon,
  MoonIcon,
  PanelIcon,
  RefreshIcon,
  ScrollPanIcon,
  ScrollZoomIcon,
  SunIcon,
} from './icons';

type TopBarProps = {
  nodeCount: number;
  busy: boolean;
  onRefreshAll: () => void;
};

const themeOptions: { value: ThemeMode; label: string; icon: ReactNode }[] = [
  { value: 'light', label: 'Light theme', icon: <SunIcon /> },
  { value: 'system', label: 'Match system theme', icon: <MonitorIcon /> },
  { value: 'dark', label: 'Dark theme', icon: <MoonIcon /> },
];

const scrollOptions: { value: ScrollMode; label: string; icon: ReactNode }[] = [
  { value: 'zoom', label: 'Scroll wheel zooms the canvas', icon: <ScrollZoomIcon /> },
  { value: 'pan', label: 'Scroll wheel pans the canvas (⌘/Ctrl + scroll zooms)', icon: <ScrollPanIcon /> },
];

function TopBarComponent({ nodeCount, busy, onRefreshAll }: TopBarProps) {
  const { theme, setTheme, scrollMode, setScrollMode, drawerOpen, setDrawerOpen } =
    usePreferences();

  return (
    <header className="topbar">
      <button
        type="button"
        className="icon-button"
        aria-label={drawerOpen ? 'Hide lists panel' : 'Show lists panel'}
        aria-pressed={drawerOpen}
        title={`${drawerOpen ? 'Hide' : 'Show'} lists panel  ( \\ )`}
        onClick={() => setDrawerOpen(!drawerOpen)}
      >
        <PanelIcon />
      </button>

      <div className="topbar__brand">
        <span className="topbar__mark" aria-hidden="true" />
        <h1>xscout</h1>
        <p>Ticker lists on an infinite canvas</p>
      </div>

      <div className="topbar__actions">
        <button
          type="button"
          className="button button--primary"
          onClick={onRefreshAll}
          disabled={nodeCount === 0 || busy}
          title="Refresh every list on the canvas  ( R )"
        >
          <RefreshIcon className={busy ? 'is-spinning' : undefined} />
          {busy ? 'Refreshing…' : 'Refresh all'}
        </button>

        <div className="segmented" role="group" aria-label="Scroll wheel behaviour">
          {scrollOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-label={option.label}
              aria-pressed={scrollMode === option.value}
              title={option.label}
              onClick={() => setScrollMode(option.value)}
            >
              {option.icon}
            </button>
          ))}
        </div>

        <div className="segmented" role="group" aria-label="Colour theme">
          {themeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-label={option.label}
              aria-pressed={theme === option.value}
              title={option.label}
              onClick={() => setTheme(option.value)}
            >
              {option.icon}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}

export const TopBar = memo(TopBarComponent);
