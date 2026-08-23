import { memo, type ReactNode } from 'react';
import { usePreferences } from '../prefs/PreferencesContext';
import type { AppView, ScrollMode, ThemeMode } from '../storage/preferences';
import {
  BoltIcon,
  CanvasIcon,
  MonitorIcon,
  MoonIcon,
  PanelIcon,
  RefreshIcon,
  ScrollPanIcon,
  ScrollZoomIcon,
  SunIcon,
} from './icons';

type TopBarProps = {
  variant: AppView;
  nodeCount?: number;
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

function TopBarComponent({ variant, nodeCount = 0, busy, onRefreshAll }: TopBarProps) {
  const { theme, setTheme, scrollMode, setScrollMode, drawerOpen, setDrawerOpen, view, setView } =
    usePreferences();

  const canvas = variant === 'canvas';

  return (
    <header className="topbar">
      {canvas ? (
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
      ) : null}

      <div className="topbar__brand">
        <span className="topbar__mark" aria-hidden="true" />
        <h1>xscout</h1>
        <p>{canvas ? 'Ticker lists on an infinite canvas' : 'Electrons into thought'}</p>
      </div>

      <div className="topbar__actions">
        <div className="segmented segmented--text" role="tablist" aria-label="Workspace">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'canvas'}
            aria-pressed={view === 'canvas'}
            title="Ticker canvas"
            onClick={() => setView('canvas')}
          >
            <CanvasIcon />
            Canvas
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'watts'}
            aria-pressed={view === 'watts'}
            title="Watts Into Thoughts dashboard"
            onClick={() => setView('watts')}
          >
            <BoltIcon />
            Watts
          </button>
        </div>

        <button
          type="button"
          className="button button--primary"
          onClick={onRefreshAll}
          disabled={canvas ? nodeCount === 0 || busy : busy}
          title={
            canvas ? 'Refresh every list on the canvas  ( R )' : 'Refresh Watts dashboard quotes'
          }
        >
          <RefreshIcon className={busy ? 'is-spinning' : undefined} />
          {busy ? 'Refreshing…' : canvas ? 'Refresh all' : 'Refresh quotes'}
        </button>

        {canvas ? (
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
        ) : null}

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
