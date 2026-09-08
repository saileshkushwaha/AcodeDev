import React, { useState } from 'react';
import { Sidebar, useTheme, useIsMobile, Icon, GithubIcon, type NavItem } from '@acode/ui';
import { useApp } from '../state/AppProvider';

export interface ShellAction {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

const icons: Record<string, React.ReactNode> = {
  dashboard: <Icon name="columns" size={18} />,
  chat: <Icon name="message" size={18} />,
  workflows: <Icon name="workflow" size={18} />,
  prompts: <Icon name="scrollText" size={18} />,
  agents: <Icon name="bot" size={18} />,
  keys: <Icon name="key" size={18} />,
  github: <GithubIcon size={18} />,
  settings: <Icon name="settings" size={18} />,
};

export const NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: icons.dashboard },
  { id: 'chat', label: 'Chat', icon: icons.chat },
  { id: 'workflows', label: 'Workflows', icon: icons.workflows },
  { id: 'prompts', label: 'Prompts & Evals', icon: icons.prompts },
  { id: 'agents', label: 'AI Agents', icon: icons.agents },
  { id: 'keys', label: 'API Keys', icon: icons.keys },
  { id: 'github', label: 'GitHub', icon: icons.github },
  { id: 'settings', label: 'Settings', icon: icons.settings },
];

export function AppShell({
  active,
  onSelect,
  header,
  children,
}: {
  active: string;
  onSelect: (id: string) => void;
  header?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { tokens } = useTheme();
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Honest chat badge: number of open conversations (sessions) across projects.
  const { projects } = useApp();
  const chatCount = projects.projectsList().reduce((n, p) => n + (p.conversations?.length ?? 0), 0);
  const items = NAV.map((item) => (item.id === 'chat' && chatCount > 0 ? { ...item, badge: chatCount } : item));

  const logo = (
    <div
      style={{
        padding: collapsed ? `${tokens.space4}px ${tokens.space2}px` : tokens.space4,
        display: 'flex',
        alignItems: 'center',
        gap: tokens.space2,
        borderBottom: `1px solid ${tokens.border}`,
        justifyContent: collapsed ? 'center' : 'flex-start',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: tokens.radiusMd,
          background: tokens.primary,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontWeight: 700,
          fontSize: tokens.fontSizeMd,
          flexShrink: 0,
        }}
      >
        A
      </div>
      {!collapsed && (
        <div style={{ whiteSpace: 'nowrap' }}>
          <div style={{ fontWeight: 700, fontSize: tokens.fontSizeMd, lineHeight: 1.1 }}>AcodeDev</div>
          <div style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted }}>AI Studio</div>
        </div>
      )}
    </div>
  );

  const sidebarNav = (
    <Sidebar
      collapsed={isMobile ? true : collapsed}
      onToggleCollapse={isMobile ? undefined : () => setCollapsed((c) => !c)}
      active={active}
      onSelect={(id) => {
        onSelect(id);
        setDrawerOpen(false);
      }}
      items={items}
      header={logo}
      footer={
        !isMobile && !collapsed ? (
          <div style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted, textAlign: 'center', paddingBottom: tokens.space1 }}>
            v0.1 · all-in-one
          </div>
        ) : undefined
      }
    />
  );

  return (
    <div style={{ display: 'flex', height: '100dvh', background: tokens.bg, color: tokens.text }}>
      {isMobile ? (
        <>
          {/* Mobile drawer */}
          {drawerOpen && (
            <div
              className="fade-in"
              onClick={() => setDrawerOpen(false)}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000 }}
            />
          )}
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              bottom: 0,
              zIndex: 1001,
              transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)',
              transition: 'transform 0.25s cubic-bezier(0.2,0.8,0.2,1)',
              boxShadow: drawerOpen ? tokens.shadowLg : 'none',
            }}
          >
            {sidebarNav}
          </div>
          {/* Mobile top bar */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: tokens.space2,
                padding: `${tokens.space2}px ${tokens.space3}px`,
                background: tokens.bgElevated,
                borderBottom: `1px solid ${tokens.border}`,
                position: 'sticky',
                top: 0,
                zIndex: 50,
              }}
            >
              <button
                onClick={() => setDrawerOpen(true)}
                aria-label="Open menu"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: tokens.text,
                  width: 36,
                  height: 36,
                  borderRadius: tokens.radiusMd,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <Icon name="menu" size={22} />
              </button>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: tokens.radiusMd,
                  background: tokens.primary,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: tokens.fontSizeSm,
                }}
              >
                A
              </div>
              <span style={{ fontWeight: 700, fontSize: tokens.fontSizeMd }}>AcodeDev</span>
              <div style={{ flex: 1 }} />
            </div>
            <main style={{ flex: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch' }}>{children}</main>
          </div>
        </>
      ) : (
        <>
          {sidebarNav}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {header}
            <main style={{ flex: 1, overflow: 'auto' }}>{children}</main>
          </div>
        </>
      )}
    </div>
  );
}
