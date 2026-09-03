import React from 'react';
import { useTheme } from './Theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg';

export function Button({
  variant = 'primary',
  size = 'md',
  children,
  disabled,
  onClick,
  full,
  style,
  type = 'button',
}: {
  variant?: Variant;
  size?: Size;
  children: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  full?: boolean;
  style?: React.CSSProperties;
  type?: 'button' | 'submit';
}) {
  const { tokens } = useTheme();
  const sizes: Record<Size, React.CSSProperties> = {
    sm: { padding: `${tokens.space1}px ${tokens.space3}px`, fontSize: tokens.fontSizeSm },
    md: { padding: `${tokens.space2}px ${tokens.space4}px`, fontSize: tokens.fontSizeSm },
    lg: { padding: `${tokens.space3}px ${tokens.space5}px`, fontSize: tokens.fontSizeMd },
  };
  const variants: Record<Variant, React.CSSProperties> = {
    primary: { background: tokens.primary, color: tokens.primaryForeground, border: `1px solid ${tokens.primary}` },
    secondary: { background: tokens.surface, color: tokens.text, border: `1px solid ${tokens.borderStrong}` },
    ghost: { background: 'transparent', color: tokens.textSecondary, border: '1px solid transparent' },
    danger: { background: tokens.danger, color: '#fff', border: `1px solid ${tokens.danger}` },
    success: { background: tokens.success, color: '#062' , border: `1px solid ${tokens.success}`},
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        ...sizes[size],
        ...variants[variant],
        borderRadius: tokens.radiusMd,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontWeight: 600,
        fontFamily: tokens.fontSans,
        transition: 'background 0.15s ease, opacity 0.15s ease, transform 0.05s ease',
        width: full ? '100%' : 'auto',
        whiteSpace: 'nowrap',
        ...style,
      }}
      onMouseEnter={(e) => {
        if (!disabled && variant === 'primary') (e.currentTarget as HTMLButtonElement).style.background = tokens.primaryHover;
      }}
      onMouseLeave={(e) => {
        if (!disabled && variant === 'primary') (e.currentTarget as HTMLButtonElement).style.background = tokens.primary;
      }}
    >
      {children}
    </button>
  );
}
