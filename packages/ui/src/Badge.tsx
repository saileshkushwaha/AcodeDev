import React from 'react';
import { useTheme } from './Theme';

export function Badge({
  children,
  color,
  style,
}: {
  children: React.ReactNode;
  color?: string;
  style?: React.CSSProperties;
}) {
  const { tokens } = useTheme();
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: `${tokens.space1 - 2}px ${tokens.space2}px`,
        borderRadius: tokens.radiusFull,
        fontSize: tokens.fontSizeXs,
        fontWeight: 600,
        color: color ?? tokens.primary,
        background: `${color ?? tokens.primary}1a`,
        border: `1px solid ${color ?? tokens.primary}33`,
        ...style,
      }}
    >
      {children}
    </span>
  );
}
