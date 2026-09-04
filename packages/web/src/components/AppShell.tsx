import React, { useState } from 'react';
import { Sidebar, useTheme, useIsMobile, type NavItem } from '@acode/ui';
import { useApp } from '../state/AppProvider';

export interface ShellAction {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

const icons: Record<string, React.ReactNode> = {
  dashboard: <I d="M4 13h6V4H4v9zm10 7h6v-7h-6v7zM4 20h6v-3H4v3zm10-16v6h6V4h-6z" />,
  chat: <I d="M8 10h8m-8 4h5m-8 8l2-2h10a2 2 0 002-2V6a2 2 0 00-2-2H8a2 2 0 00-2 2v14l-2 2z" />,
  workflows: <I d="M5 3v5m14-5v5M5 18v3m14-3v3M4 8h4a1 1 0 011 1v4a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1zm12 0h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V9a1 1 0 011-1zM4 18h4a1 1 0 011 1v1a1 1 0 01-1 1H4" />,
  prompts: <I d="M4 4h16v4H4V4zm0 6h16v4H4v-4zm0 6h10v4H4v-4z" />,
  agents: <I d="M12 2a5 5 0 014.9 4H19a1 1 0 011 1v2a1 1 0 01-1 1v6a4 4 0 01-4 4h-1v2h4v2H8v-2h4v-2H8a4 4 0 01-4-4v-6a1 1 0 01-1-1V7a1 1 0 011-1h2.1A5 5 0 0112 2z" />,
  keys: <I d="M7 14a3 3 0 100 6 3 3 0 000-6zm0 0V8a2 2 0 012-2h2M11 6h1m-3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />,
  github: <I d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 00-1.3-3.2 4.2 4.2 0 00-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 00-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 00-.1 3.2A4.6 4.6 0 004 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" />,
};

function I({ d }: { d: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export const NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: icons.dashboard },
  { id: 'chat', label: 'Chat', icon: icons.chat },
  { id: 'workflows', label: 'Workflows', icon: icons.workflows },
  { id: 'prompts', label: 'Prompts & Evals', icon: icons.prompts },
  { id: 'agents', label: 'AI Agents', icon: icons.agents },
  { id: 'keys', label: 'API Keys', icon: icons.keys },
  { id: 'github', label: 'GitHub', icon: icons.github },
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
  const [collapsed, setCollapsed] = useState(false);
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
      <div style={{ width: 32, height: 32, borderRadius: tokens.radiusMd, background: tokens.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: tokens.fontSizeMd, flexShrink: 0 }}>A</div>
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
      footer={!isMobile && !collapsed ? <div style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted, textAlign: 'center', paddingBottom: tokens.space1 }}>v0.1 · all-in-one</div> : undefined}
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
                style={{ background: 'transparent', border: 'none', color: tokens.text, width: 36, height: 36, borderRadius: tokens.radiusMd, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
              </button>
              <div style={{ width: 28, height: 28, borderRadius: tokens.radiusMd, background: tokens.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: tokens.fontSizeSm }}>A</div>
              <span style={{ fontWeight: 700, fontSize: tokens.fontSizeMd }}>AcodeDev</span>
              <div style={{ flex: 1 }} />
              {header ? <MobileHeaderActions /> : null}
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

function MobileHeaderActions() {
  const { tokens } = useTheme();
  return (
    <button
      onClick={() => {
        /* placeholder for mobile menu extras */
      }}
      aria-label="More"
      style={{ background: 'transparent', border: 'none', color: tokens.text, width: 36, height: 36, borderRadius: tokens.radiusMd, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
    </button>
  );
}
