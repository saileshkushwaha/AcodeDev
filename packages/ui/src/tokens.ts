export type ColorMode = 'light' | 'dark';

export interface ThemeTokens {
  mode: ColorMode;
  // Surfaces
  bg: string;
  bgElevated: string;
  bgSubtle: string;
  surface: string;
  surfaceHover: string;
  border: string;
  borderStrong: string;
  // Text
  text: string;
  textSecondary: string;
  textMuted: string;
  // Brand
  primary: string;
  primaryHover: string;
  primaryForeground: string;
  accent: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  // Syntax/code
  codeBg: string;
  // Shape
  radiusSm: number;
  radiusMd: number;
  radiusLg: number;
  radiusFull: number;
  // Spacing
  space1: number;
  space2: number;
  space3: number;
  space4: number;
  space5: number;
  space6: number;
  space8: number;
  // Typography
  fontSans: string;
  fontMono: string;
  fontSizeXs: string;
  fontSizeSm: string;
  fontSizeMd: string;
  fontSizeLg: string;
  fontSizeXl: string;
  fontSize2xl: string;
  fontSize3xl: string;
  // Shadows
  shadowSm: string;
  shadowMd: string;
  shadowLg: string;
}

export const darkTokens: ThemeTokens = {
  mode: 'dark',
  bg: '#0b0d12',
  bgElevated: '#11141c',
  bgSubtle: '#0e1118',
  surface: '#151924',
  surfaceHover: '#1b2030',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.14)',
  text: '#e6e9f0',
  textSecondary: '#a2a9b8',
  textMuted: '#6b7280',
  primary: '#7c6cff',
  primaryHover: '#8d7fff',
  primaryForeground: '#ffffff',
  accent: '#22d3ee',
  success: '#34d399',
  warning: '#fbbf24',
  danger: '#f87171',
  info: '#60a5fa',
  codeBg: '#0d1017',
  radiusSm: 6,
  radiusMd: 10,
  radiusLg: 16,
  radiusFull: 999,
  space1: 4,
  space2: 8,
  space3: 12,
  space4: 16,
  space5: 20,
  space6: 24,
  space8: 32,
  fontSans:
    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  fontMono: "'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
  fontSizeXs: '0.75rem',
  fontSizeSm: '0.875rem',
  fontSizeMd: '1rem',
  fontSizeLg: '1.125rem',
  fontSizeXl: '1.25rem',
  fontSize2xl: '1.5rem',
  fontSize3xl: '2rem',
  shadowSm: '0 1px 2px rgba(0,0,0,0.3)',
  shadowMd: '0 6px 16px rgba(0,0,0,0.4)',
  shadowLg: '0 16px 40px rgba(0,0,0,0.5)',
};

export const lightTokens: ThemeTokens = {
  mode: 'light',
  bg: '#f7f8fb',
  bgElevated: '#ffffff',
  bgSubtle: '#eef0f6',
  surface: '#ffffff',
  surfaceHover: '#f2f3f9',
  border: 'rgba(0,0,0,0.08)',
  borderStrong: 'rgba(0,0,0,0.14)',
  text: '#101321',
  textSecondary: '#4b5264',
  textMuted: '#8a90a0',
  primary: '#6c5ce7',
  primaryHover: '#5a4bd1',
  primaryForeground: '#ffffff',
  accent: '#0ea5b7',
  success: '#16a34a',
  warning: '#d97706',
  danger: '#dc2626',
  info: '#2563eb',
  codeBg: '#f1f2f7',
  radiusSm: 6,
  radiusMd: 10,
  radiusLg: 16,
  radiusFull: 999,
  space1: 4,
  space2: 8,
  space3: 12,
  space4: 16,
  space5: 20,
  space6: 24,
  space8: 32,
  fontSans:
    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  fontMono: "'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
  fontSizeXs: '0.75rem',
  fontSizeSm: '0.875rem',
  fontSizeMd: '1rem',
  fontSizeLg: '1.125rem',
  fontSizeXl: '1.25rem',
  fontSize2xl: '1.5rem',
  fontSize3xl: '2rem',
  shadowSm: '0 1px 3px rgba(16,19,33,0.08)',
  shadowMd: '0 8px 20px rgba(16,19,33,0.12)',
  shadowLg: '0 20px 50px rgba(16,19,33,0.16)',
};

export function getTokens(mode: ColorMode): ThemeTokens {
  return mode === 'dark' ? darkTokens : lightTokens;
}
