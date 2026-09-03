import React from 'react';
import { useTheme } from './Theme';
import { Badge } from './Badge';
import { Button } from './Button';

export interface NavItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: number;
}

export function Sidebar({
  items,
  active,
  onSelect,
  footer,
  header,
}: {
  items: NavItem[];
  active: string;
  onSelect: (id: string) => void;
  footer?: React.ReactNode;
  header?: React.ReactNode;
}) {
  const { tokens } = useTheme();
  return (
    <aside
      style={{
        width: 220,
        background: tokens.bgElevated,
        borderRight: `1px solid ${tokens.border}`,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      {header}
      <nav style={{ padding: tokens.space3, display: 'flex', flexDirection: 'column', gap: 2, flex: 1, overflowY: 'auto' }}>
        {items.map((item) => {
          const isActive = item.id === active;
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: tokens.space3,
                padding: `${tokens.space2}px ${tokens.space3}px`,
                border: 'none',
                borderRadius: tokens.radiusMd,
                background: isActive ? tokens.primary : tokens.surface,
                color: isActive ? tokens.primaryForeground : tokens.textSecondary,
                fontWeight: isActive ? 600 : 500,
                fontSize: tokens.fontSizeSm,
                fontFamily: tokens.fontSans,
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%',
                transition: 'background 0.1s ease',
              }}
            >
              {item.icon && <span style={{ display: 'inline-flex' }}>{item.icon}</span>}
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.badge !== undefined && item.badge > 0 && (
                <Badge color={isActive ? '#fff' : tokens.primary}>{item.badge}</Badge>
              )}
            </button>
          );
        })}
      </nav>
      {footer && <div style={{ padding: tokens.space3, borderTop: `1px solid ${tokens.border}` }}>{footer}</div>}
    </aside>
  );
}
