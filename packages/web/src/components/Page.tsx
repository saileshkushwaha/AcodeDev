import React from 'react';
import { useTheme } from '@acode/ui';

export function Page({ children, maxWidth = 1200 }: { children: React.ReactNode; maxWidth?: number }) {
  return (
    <div style={{ padding: 24, maxWidth, margin: '0 auto', width: '100%' }}>
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  const { tokens } = useTheme();
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: tokens.space4, marginBottom: tokens.space5, flexWrap: 'wrap' }}>
      <div>
        <h1 style={{ margin: 0, fontSize: tokens.fontSize2xl, fontWeight: 700, color: tokens.text }}>{title}</h1>
        {subtitle && <p style={{ margin: `${tokens.space1}px 0 0`, color: tokens.textSecondary, fontSize: tokens.fontSizeSm }}>{subtitle}</p>}
      </div>
      {actions && <div style={{ display: 'flex', gap: tokens.space2, alignItems: 'center' }}>{actions}</div>}
    </div>
  );
}
