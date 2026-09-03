import React from 'react';
import { useTheme } from './Theme';

export function Select({
  label,
  value,
  onChange,
  options,
  hint,
  multiple,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
  hint?: string;
  multiple?: boolean;
}) {
  const { tokens } = useTheme();
  const base: React.CSSProperties = {
    width: '100%',
    background: tokens.bg,
    border: `1px solid ${tokens.borderStrong}`,
    borderRadius: tokens.radiusMd,
    color: tokens.text,
    padding: `${tokens.space2}px ${tokens.space3}px`,
    fontSize: tokens.fontSizeSm,
    fontFamily: tokens.fontSans,
    outline: 'none',
    boxSizing: 'border-box',
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.space1 }}>
      {label && <label style={{ fontSize: tokens.fontSizeSm, color: tokens.textSecondary, fontWeight: 500 }}>{label}</label>}
      <select value={value} onChange={(e) => onChange(e.target.value)} style={base} multiple={multiple}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <span style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted }}>{hint}</span>}
    </div>
  );
}
