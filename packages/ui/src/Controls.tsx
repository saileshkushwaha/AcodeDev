import React, { useEffect, useState } from 'react';
import { useTheme } from './Theme';

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  const { tokens } = useTheme();
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: tokens.space2, cursor: 'pointer' }}>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={{
          width: 40,
          height: 22,
          borderRadius: tokens.radiusFull,
          background: checked ? tokens.primary : tokens.surfaceHover,
          border: `1px solid ${tokens.borderStrong}`,
          position: 'relative',
          cursor: 'pointer',
          transition: 'background 0.15s ease',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: checked ? 20 : 2,
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: '#fff',
            transition: 'left 0.15s ease',
          }}
        />
      </button>
      {label && <span style={{ fontSize: tokens.fontSizeSm, color: tokens.textSecondary }}>{label}</span>}
    </label>
  );
}

export function Spinner({ size = 20, color }: { size?: number; color?: string }) {
  const { tokens } = useTheme();
  return (
    <span
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        border: `2px solid ${color ?? tokens.border}`,
        borderTopColor: color ?? tokens.primary,
        borderRadius: '50%',
        animation: 'acode-spin 0.8s linear infinite',
      }}
    />
  );
}

export function TabBar({ tabs, active, onChange }: { tabs: { id: string; label: string; icon?: React.ReactNode }[]; active: string; onChange: (id: string) => void }) {
  const { tokens } = useTheme();
  return (
    <div style={{ display: 'flex', gap: tokens.space1, borderBottom: `1px solid ${tokens.border}`, overflowX: 'auto' }}>
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            style={{
              padding: `${tokens.space2}px ${tokens.space3}px`,
              border: 'none',
              background: 'transparent',
              borderBottom: isActive ? `2px solid ${tokens.primary}` : '2px solid transparent',
              color: isActive ? tokens.text : tokens.textSecondary,
              fontWeight: isActive ? 600 : 500,
              fontSize: tokens.fontSizeSm,
              fontFamily: tokens.fontSans,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: tokens.space1,
              whiteSpace: 'nowrap',
            }}
          >
            {t.icon}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export function Modal({ open, onClose, title, children, width = 560 }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; width?: number }) {
  const { tokens } = useTheme();
  const [visible, setVisible] = useState(open);
  useEffect(() => {
    if (open) setVisible(true);
    else {
      const t = setTimeout(() => setVisible(false), 200);
      return () => clearTimeout(t);
    }
  }, [open]);
  if (!open && !visible) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: tokens.space4,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: tokens.surface,
          border: `1px solid ${tokens.border}`,
          borderRadius: tokens.radiusLg,
          width: width,
          maxWidth: '100%',
          maxHeight: '85vh',
          overflow: 'auto',
          boxShadow: tokens.shadowLg,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `${tokens.space3}px ${tokens.space4}px`, borderBottom: `1px solid ${tokens.border}` }}>
          <div style={{ fontSize: tokens.fontSizeMd, fontWeight: 600, color: tokens.text }}>{title}</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: tokens.textMuted, fontSize: tokens.fontSizeXl, cursor: 'pointer', lineHeight: 1 }}>
            ×
          </button>
        </div>
        <div style={{ padding: tokens.space4 }}>{children}</div>
      </div>
    </div>
  );
}

export function ProgressBar({ value, max = 100, color }: { value: number; max?: number; color?: string }) {
  const { tokens } = useTheme();
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div style={{ width: '100%', height: 8, background: tokens.surfaceHover, borderRadius: tokens.radiusFull, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color ?? tokens.primary, borderRadius: tokens.radiusFull, transition: 'width 0.3s ease' }} />
    </div>
  );
}

export function Chip({ children, active, onClick }: { children: React.ReactNode; active?: boolean; onClick?: () => void }) {
  const { tokens } = useTheme();
  return (
    <button
      onClick={onClick}
      style={{
        padding: `${tokens.space1}px ${tokens.space3}px`,
        border: `1px solid ${active ? tokens.primary : tokens.borderStrong}`,
        borderRadius: tokens.radiusFull,
        background: active ? `${tokens.primary}1a` : tokens.surface,
        color: active ? tokens.primary : tokens.textSecondary,
        fontSize: tokens.fontSizeXs,
        fontWeight: 600,
        fontFamily: tokens.fontSans,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {children}
    </button>
  );
}
