import React from 'react';
import { useTheme } from '@acode/ui';

export function Page({ children, maxWidth = 1200 }: { children: React.ReactNode; maxWidth?: number }) {
  return (
    <div style={{ padding: 'clamp(12px, 2.5vw, 28px)', maxWidth, margin: '0 auto', width: '100%' }}>
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  const { tokens } = useTheme();
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: tokens.space4, marginBottom: tokens.space5, flexWrap: 'wrap' }}>
      <div style={{ minWidth: 0 }}>
        <h1 style={{ margin: 0, fontSize: 'clamp(1.25rem, 3vw, 2rem)', fontWeight: 800, color: tokens.text, letterSpacing: '-0.02em' }}>{title}</h1>
        {subtitle && <p style={{ margin: `${tokens.space1}px 0 0`, color: tokens.textSecondary, fontSize: tokens.fontSizeSm }}>{subtitle}</p>}
      </div>
      {actions && <div style={{ display: 'flex', gap: tokens.space2, alignItems: 'center', flexWrap: 'wrap' }}>{actions}</div>}
    </div>
  );
}
