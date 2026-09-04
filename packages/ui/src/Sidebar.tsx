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
  collapsed,
  onToggleCollapse,
}: {
  items: NavItem[];
  active: string;
  onSelect: (id: string) => void;
  footer?: React.ReactNode;
  header?: React.ReactNode;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const { tokens } = useTheme();

  const navButton: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.space3,
    padding: collapsed ? `${tokens.space3}px 0` : `${tokens.space2}px ${tokens.space3}px`,
    border: 'none',
    borderRadius: tokens.radiusMd,
    background: 'transparent',
    color: tokens.textSecondary,
    fontWeight: 500,
    fontSize: tokens.fontSizeSm,
    fontFamily: tokens.fontSans,
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
    transition: 'background 0.1s ease, color 0.1s ease',
    justifyContent: collapsed ? 'center' : 'flex-start',
    minHeight: 40,
    position: 'relative',
  };

  return (
    <aside
      style={{
        width: collapsed ? 64 : 220,
        background: tokens.bgElevated,
        borderRight: `1px solid ${tokens.border}`,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        transition: 'width 0.2s ease',
        overflow: 'hidden',
      }}
    >
      {header}
      <nav
        style={{
          padding: collapsed ? `${tokens.space3}px ${tokens.space2}px` : tokens.space3,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          flex: 1,
          overflowY: 'auto',
        }}
      >
        {items.map((item) => {
          const isActive = item.id === active;
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              title={collapsed ? item.label : undefined}
              style={{
                ...navButton,
                background: isActive ? tokens.primary : 'transparent',
                color: isActive ? tokens.primaryForeground : tokens.textSecondary,
                fontWeight: isActive ? 600 : 500,
              }}
            >
              {item.icon && (
                <span
                  style={{
                    display: 'inline-flex',
                    width: 20,
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {item.icon}
                </span>
              )}
              {!collapsed && (
                <>
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <Badge color={isActive ? '#fff' : tokens.primary}>{item.badge}</Badge>
                  )}
                </>
              )}
              {collapsed && item.badge !== undefined && item.badge > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: 2,
                    right: 6,
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: isActive ? '#fff' : tokens.primary,
                  }}
                />
              )}
            </button>
          );
        })}
      </nav>
      {onToggleCollapse && (
        <div
          style={{
            padding: collapsed ? `${tokens.space2}px ${tokens.space1}px` : tokens.space3,
            borderTop: `1px solid ${tokens.border}`,
            display: 'flex',
            justifyContent: collapsed ? 'center' : 'flex-start',
          }}
        >
          <button
            onClick={onToggleCollapse}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            style={{
              width: collapsed ? 32 : '100%',
              display: 'flex',
              alignItems: 'center',
              gap: tokens.space3,
              padding: `${tokens.space1 + 2}px ${collapsed ? 0 : tokens.space3}px`,
              background: 'transparent',
              border: 'none',
              borderRadius: tokens.radiusMd,
              color: tokens.textMuted,
              fontSize: tokens.fontSizeSm,
              fontFamily: tokens.fontSans,
              cursor: 'pointer',
              justifyContent: collapsed ? 'center' : 'flex-start',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="18" rx="1" />
              <rect x="14" y="3" width="7" height="18" rx="1" />
            </svg>
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      )}
      {footer && !collapsed && <div style={{ padding: tokens.space3, borderTop: `1px solid ${tokens.border}` }}>{footer}</div>}
    </aside>
  );
}
