import type { SVGProps } from 'react';

// Single-path 24x24 glyphs so buttons can size them with `em` units and
// inherit colour from `currentColor`.
function Glyph({ d, ...props }: { d: string } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...props}>
      <path d={d} fill="currentColor" />
    </svg>
  );
}

export function RefreshIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Glyph
      {...props}
      d="M17.65 6.35A7.96 7.96 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35Z"
    />
  );
}

export function CloseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Glyph
      {...props}
      d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12 5.7 16.89a1 1 0 1 0 1.41 1.41L12 13.41l4.89 4.89a1 1 0 0 0 1.41-1.41L13.41 12l4.89-4.89a1 1 0 0 0 0-1.4Z"
    />
  );
}

export function PlusIcon(props: SVGProps<SVGSVGElement>) {
  return <Glyph {...props} d="M13 5a1 1 0 1 0-2 0v6H5a1 1 0 1 0 0 2h6v6a1 1 0 1 0 2 0v-6h6a1 1 0 1 0 0-2h-6V5Z" />;
}

export function MinusIcon(props: SVGProps<SVGSVGElement>) {
  return <Glyph {...props} d="M5 11h14a1 1 0 1 1 0 2H5a1 1 0 1 1 0-2Z" />;
}

export function TrashIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Glyph
      {...props}
      d="M9 3a1 1 0 0 0-1 1v1H5a1 1 0 1 0 0 2h14a1 1 0 1 0 0-2h-3V4a1 1 0 0 0-1-1H9Zm-2.3 6 .84 10.1A2 2 0 0 0 9.53 21h4.94a2 2 0 0 0 1.99-1.9L17.3 9H6.7Zm3.3 2h1.5v7H10v-7Zm2.5 0H14v7h-1.5v-7Z"
    />
  );
}

export function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Glyph
      {...props}
      d="M10.5 3a7.5 7.5 0 1 0 4.55 13.46l4 4a1 1 0 0 0 1.41-1.42l-4-4A7.5 7.5 0 0 0 10.5 3Zm0 2a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Z"
    />
  );
}

export function SunIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Glyph
      {...props}
      d="M12 4.5a1 1 0 0 1-1-1V2a1 1 0 1 1 2 0v1.5a1 1 0 0 1-1 1Zm0 15a1 1 0 0 1 1 1V22a1 1 0 1 1-2 0v-1.5a1 1 0 0 1 1-1ZM4.5 12a1 1 0 0 1-1 1H2a1 1 0 1 1 0-2h1.5a1 1 0 0 1 1 1Zm17.5 0a1 1 0 0 1-1 1h-1.5a1 1 0 1 1 0-2H21a1 1 0 0 1 1 1ZM6.34 6.34a1 1 0 0 1-1.42 0l-1-1A1 1 0 1 1 5.34 3.9l1 1a1 1 0 0 1 0 1.43Zm12.73 12.73a1 1 0 0 1-1.41 0l-1-1a1 1 0 0 1 1.41-1.42l1 1a1 1 0 0 1 0 1.42ZM4.93 19.07a1 1 0 0 1 0-1.42l1-1a1 1 0 0 1 1.41 1.42l-1 1a1 1 0 0 1-1.41 0ZM17.66 6.34a1 1 0 0 1 0-1.42l1-1a1 1 0 1 1 1.41 1.42l-1 1a1 1 0 0 1-1.41 0ZM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z"
    />
  );
}

export function MoonIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Glyph
      {...props}
      d="M12.74 2.06a1 1 0 0 1 .32 1.2 7 7 0 0 0 8.68 9.15 1 1 0 0 1 1.23 1.36A10 10 0 1 1 11.5 1.9a1 1 0 0 1 1.24.16Z"
    />
  );
}

export function MonitorIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Glyph
      {...props}
      d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-5v2h2a1 1 0 1 1 0 2H7a1 1 0 1 1 0-2h2v-2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 2v9h16V6H4Z"
    />
  );
}

export function FitViewIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Glyph
      {...props}
      d="M4 3h4a1 1 0 1 1 0 2H5v3a1 1 0 1 1-2 0V4a1 1 0 0 1 1-1Zm12 0h4a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0V5h-3a1 1 0 1 1 0-2ZM4 15a1 1 0 0 1 1 1v3h3a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1Zm16 0a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 1 1 0-2h3v-3a1 1 0 0 1 1-1Zm-11-6h6v6H9V9Z"
    />
  );
}

export function MapIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Glyph
      {...props}
      d="M14.6 3.06a1 1 0 0 1 .8 0l5 2.1A1 1 0 0 1 21 6.08v13a1 1 0 0 1-1.39.92L15 18.08l-5.6 2.36a1 1 0 0 1-.8 0l-5-2.1A1 1 0 0 1 3 17.42v-13a1 1 0 0 1 1.39-.92L9 5.42l5.6-2.36ZM10 7.16v11.02l4-1.68V5.48l-4 1.68Z"
    />
  );
}

export function PanelIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Glyph
      {...props}
      d="M4 3h16a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm0 2v14h5V5H4Zm7 0v14h9V5h-9Z"
    />
  );
}

export function ScrollZoomIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Glyph
      {...props}
      d="M10.5 2a7.5 7.5 0 1 0 4.55 13.46l4 4a1 1 0 0 0 1.41-1.42l-4-4A7.5 7.5 0 0 0 10.5 2Zm0 2a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11ZM7.5 8.5h6a1 1 0 1 1 0 2h-6a1 1 0 1 1 0-2Z"
    />
  );
}

export function ScrollPanIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Glyph
      {...props}
      d="M12 2.3 15 5.3a1 1 0 0 1-1.42 1.4L13 6.13v4.87h4.88l-.58-.58a1 1 0 0 1 1.41-1.42l3 3-3 3a1 1 0 0 1-1.41-1.42l.58-.58H13v4.88l.58-.58A1 1 0 0 1 15 18.7l-3 3-3-3a1 1 0 0 1 1.42-1.42l.58.59V13H6.12l.59.58A1 1 0 0 1 5.3 15l-3-3 3-3a1 1 0 0 1 1.41 1.42l-.59.58H11V6.13l-.58.58A1 1 0 0 1 9 5.3l3-3Z"
    />
  );
}

export function GripIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Glyph
      {...props}
      d="M9 4.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm6 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM9 10.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm6 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM9 16.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm6 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z"
    />
  );
}

export function TargetIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Glyph
      {...props}
      d="M12 2a1 1 0 0 1 1 1v1.06a8 8 0 0 1 6.94 6.94H21a1 1 0 1 1 0 2h-1.06A8 8 0 0 1 13 19.94V21a1 1 0 1 1-2 0v-1.06A8 8 0 0 1 4.06 13H3a1 1 0 1 1 0-2h1.06A8 8 0 0 1 11 4.06V3a1 1 0 0 1 1-1Zm0 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12Zm0 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z"
    />
  );
}

export function KeyboardIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Glyph
      {...props}
      d="M3 6h18a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Zm1 2v8h16V8H4Zm2 1.5h2v2H6v-2Zm3.5 0h2v2h-2v-2Zm3.5 0h2v2h-2v-2Zm3.5 0h2v2h-2v-2ZM6 13h2v2H6v-2Zm3.5 0h5v2h-5v-2ZM16 13h2v2h-2v-2Z"
    />
  );
}
