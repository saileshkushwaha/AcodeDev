import React, { createContext, useContext, useEffect, useState } from 'react';
import { ColorMode, ThemeTokens, getTokens } from './tokens';

const ThemeContext = createContext<{
  mode: ColorMode;
  tokens: ThemeTokens;
  setMode: (m: ColorMode) => void;
  toggle: () => void;
}>({
  mode: 'dark',
  tokens: getTokens('dark'),
  setMode: () => {},
  toggle: () => {},
});

export function ThemeProvider({ children, initialMode = 'dark' }: { children: React.ReactNode; initialMode?: ColorMode }) {
  const [mode, setMode] = useState<ColorMode>(initialMode);
  const tokens = getTokens(mode);

  useEffect(() => {
    document.documentElement.style.colorScheme = mode;
    const root = document.documentElement;
    root.style.setProperty('--bg', tokens.bg);
    root.style.setProperty('--bg-elevated', tokens.bgElevated);
    root.style.setProperty('--surface', tokens.surface);
    root.style.setProperty('--surface-hover', tokens.surfaceHover);
    root.style.setProperty('--border', tokens.border);
    root.style.setProperty('--border-strong', tokens.borderStrong);
    root.style.setProperty('--text', tokens.text);
    root.style.setProperty('--text-secondary', tokens.textSecondary);
    root.style.setProperty('--text-muted', tokens.textMuted);
    root.style.setProperty('--primary', tokens.primary);
    root.style.setProperty('--primary-hover', tokens.primaryHover);
    root.style.setProperty('--primary-fg', tokens.primaryForeground);
    root.style.setProperty('--accent', tokens.accent);
    root.style.setProperty('--success', tokens.success);
    root.style.setProperty('--warning', tokens.warning);
    root.style.setProperty('--danger', tokens.danger);
    root.style.setProperty('--info', tokens.info);
    root.style.setProperty('--code-bg', tokens.codeBg);
  }, [mode, tokens]);

  return (
    <ThemeContext.Provider value={{ mode, tokens, setMode, toggle: () => setMode(mode === 'dark' ? 'light' : 'dark') }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
