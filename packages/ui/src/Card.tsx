import React from 'react';
import { useTheme } from './Theme';

export function Card({
  children,
  title,
  subtitle,
  actions,
  style,
  padded = true,
}: {
  children?: React.ReactNode;
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  style?: React.CSSProperties;
  padded?: boolean;
}) {
  const { tokens } = useTheme();
  return (
    <div
      style={{
        background: tokens.surface,
        border: `1px solid ${tokens.border}`,
        borderRadius: tokens.radiusLg,
        overflow: 'hidden',
        boxShadow: tokens.shadowSm,
        ...style,
      }}
    >
      {(title || actions) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: `${tokens.space3}px ${tokens.space4}px`,
            borderBottom: `1px solid ${tokens.border}`,
          }}
        >
          <div>
            {title && <div style={{ fontWeight: 600, fontSize: tokens.fontSizeMd, color: tokens.text }}>{title}</div>}
            {subtitle && <div style={{ fontSize: tokens.fontSizeSm, color: tokens.textMuted, marginTop: 2 }}>{subtitle}</div>}
          </div>
          {actions && <div style={{ display: 'flex', gap: tokens.space2 }}>{actions}</div>}
        </div>
      )}
      <div style={{ padding: padded ? tokens.space4 : 0 }}>{children}</div>
    </div>
  );
}
