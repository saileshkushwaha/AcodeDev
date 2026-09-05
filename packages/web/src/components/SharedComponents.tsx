import React, { useState, memo } from 'react';
import { Button, Input, Spinner, Modal, useTheme } from '@acode/ui';

/** Centered empty state message. */
export function EmptyState({ children }: { children: React.ReactNode }) {
  const { tokens } = useTheme();
  return (
    <div style={{ textAlign: 'center', color: tokens.textMuted, padding: tokens.space8 }}>
      {children}
    </div>
  );
}

/** Centered loading spinner. */
export function LoadingSpinner({ size = 28, padding }: { size?: number; padding?: string | number }) {
  const { tokens } = useTheme();
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: padding ?? tokens.space8 }}>
      <Spinner size={size} />
    </div>
  );
}

/** Circle avatar with initial letter. */
export function Avatar({ text, size = 28 }: { text: string; size?: number }) {
  const { tokens } = useTheme();
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: tokens.primary, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: tokens.fontSizeXs, fontWeight: 600, flexShrink: 0 }}>
      {text}
    </div>
  );
}

/** Back-navigation button. */
export function BackButton({ onClick, label = 'Back' }: { onClick: () => void; label?: string }) {
  const { tokens } = useTheme();
  return (
    <button
      onClick={onClick}
      style={{ background: 'transparent', border: 'none', color: tokens.textSecondary, cursor: 'pointer', fontSize: tokens.fontSizeSm, fontWeight: 600, padding: 0, marginBottom: tokens.space2 }}
    >
      ← {label}
    </button>
  );
}

/** Filter chip pills for selecting a repo. */
export const FilterChips = memo(function FilterChips({ repos, value, onChange }: { repos: { fullName: string; name: string }[]; value: string; onChange: (v: string) => void }) {
  const { tokens } = useTheme();
  return (
    <div style={{ display: 'flex', gap: tokens.space1, flexWrap: 'wrap', marginBottom: tokens.space3 }}>
      {repos.map((r) => (
        <button
          key={r.fullName}
          onClick={() => onChange(r.fullName === value ? 'all' : r.fullName)}
          style={{ padding: '4px 10px', borderRadius: tokens.radiusFull, border: `1px solid ${tokens.borderStrong}`, background: r.fullName === value ? tokens.primary : 'transparent', color: r.fullName === value ? tokens.primaryForeground : tokens.textSecondary, fontSize: tokens.fontSizeXs, fontWeight: 600, cursor: 'pointer' }}
        >
          {r.name}
        </button>
      ))}
    </div>
  );
});

/** Standardized modal form layout. */
export function FormModal({ title, onClose, onSubmit, submitting, children }: {
  title: string;
  onClose: () => void;
  onSubmit: () => void;
  submitting?: boolean;
  children: React.ReactNode;
}) {
  const { tokens } = useTheme();
  return (
    <Modal open onClose={onClose} title={title}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.space3 }}>
        {children}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: tokens.space2, marginTop: tokens.space5 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={onSubmit} disabled={submitting}>{submitting ? 'Saving…' : 'Save'}</Button>
      </div>
    </Modal>
  );
}
