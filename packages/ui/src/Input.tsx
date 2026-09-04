import React from 'react';
import { useTheme } from './Theme';

export function Input({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  monospace,
  hint,
  error,
  textarea,
  rows,
  onEnter,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  monospace?: boolean;
  hint?: string | React.ReactNode;
  error?: string;
  textarea?: boolean;
  rows?: number;
  onEnter?: () => void;
}) {
  const { tokens } = useTheme();
  const base: React.CSSProperties = {
    width: '100%',
    background: tokens.bg,
    border: `1px solid ${error ? tokens.danger : tokens.borderStrong}`,
    borderRadius: tokens.radiusMd,
    color: tokens.text,
    padding: `${tokens.space2}px ${tokens.space3}px`,
    fontSize: tokens.fontSizeSm,
    fontFamily: monospace ? tokens.fontMono : tokens.fontSans,
    outline: 'none',
    resize: textarea ? 'vertical' : 'none',
    boxSizing: 'border-box',
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.space1 }}>
      {label && <label style={{ fontSize: tokens.fontSizeSm, color: tokens.textSecondary, fontWeight: 500 }}>{label}</label>}
      {textarea ? (
        <textarea rows={rows ?? 4} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} style={base} />
      ) : (
        <input type={type} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={onEnter ? (e) => { if (e.key === 'Enter') onEnter(); } : undefined} style={base} />
      )}
      {hint && !error && <span style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted }}>{hint}</span>}
      {error && <span style={{ fontSize: tokens.fontSizeXs, color: tokens.danger }}>{error}</span>}
    </div>
  );
}
