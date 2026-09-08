import React, { useState, useCallback, useEffect } from 'react';
import { useTheme } from '@acode/ui';
import { readRaw, writeRaw } from '@acode/core';
import { AppShell } from './components/AppShell';
import { Dashboard } from './screens/Dashboard';
import { ChatScreen } from './screens/Chat';
import { WorkflowsScreen } from './screens/Workflows';
import { PromptsScreen } from './screens/Prompts';
import { AgentsScreen } from './screens/Agents';
import { KeysScreen } from './screens/Keys';
import { GitHubScreen } from './screens/GitHub';
import { SettingsScreen } from './screens/SettingsScreen';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { LoginScreen, SetupPinScreen } from './screens/LoginScreen';

const VALID_TABS = ['dashboard', 'chat', 'workflows', 'prompts', 'agents', 'keys', 'github', 'settings'];
const TAB_KEY = 'acode.ui.tab';

function AppContent() {
  const { session, isLoading } = useAuth();
  const [tab, setTab] = useState(() => {
    const t = readRaw(TAB_KEY);
    return t && VALID_TABS.includes(t) ? t : 'dashboard';
  });
  const [promptIntent, setPromptIntent] = useState<{ tab: 'prompts' | 'evals'; key: number }>({ tab: 'prompts', key: 0 });
  const { tokens } = useTheme();

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const provider = urlParams.get('provider') || 'openrouter';

    if (code && state && window.opener) {
      console.log('[App] OAuth callback detected, sending to opener', { provider, codeLength: code.length, stateLength: state.length });
      window.opener.postMessage(
        {
          type: 'oauth-callback',
          provider,
          code,
          state,
        },
        window.location.origin,
      );
      const cleanUrl = `${window.location.pathname}${window.location.hash}`;
      window.history.replaceState({}, '', cleanUrl);
      window.close();
    } else if (code && state && !window.opener) {
      console.log('[App] OAuth callback detected but no opener window');
    }

    const error = urlParams.get('error');
    const errorDescription = urlParams.get('error_description');
    if (error && window.opener) {
      window.opener.postMessage(
        {
          type: 'oauth-error',
          provider,
          error,
          error_description: errorDescription,
        },
        window.location.origin,
      );
      window.close();
    }
  }, []);

  const changeTab = useCallback((t: string) => {
    setTab(t);
    writeRaw(TAB_KEY, t);
  }, []);

  const openPromptTab = (t: 'prompts' | 'evals') => {
    changeTab('prompts');
    setPromptIntent((p) => ({ tab: t, key: p.key + 1 }));
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: tokens.bg }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '48px',
            height: '48px',
            border: '3px solid var(--primary)',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px',
          }} />
          <div style={{ color: tokens.textSecondary }}>Loading...</div>
          <style>{`
            @keyframes spin { to { transform: rotate(360deg); } }
          `}</style>
        </div>
      </div>
    );
  }

  if (!session.hasPin) {
    return <SetupPinScreen onComplete={() => {}} />;
  }

  if (!session.isLoggedIn) {
    return <LoginScreen onLogin={() => {}} />;
  }

  const screens: Record<string, React.ReactNode> = {
    dashboard: <Dashboard onNavigate={changeTab} onOpenEvaluations={() => openPromptTab('evals')} />,
    chat: <ChatScreen onNavigate={changeTab} />,
    workflows: <WorkflowsScreen onNavigate={changeTab} />,
    prompts: <PromptsScreen key={promptIntent.key} initialTab={promptIntent.tab} onNavigate={changeTab} />,
    agents: <AgentsScreen />,
    keys: <KeysScreen />,
    github: <GitHubScreen />,
    settings: <SettingsScreen />,
  };

  return (
    <div style={{ fontFamily: tokens.fontSans, background: tokens.bg, color: tokens.text, minHeight: '100dvh' }}>
      <AppShell active={tab} onSelect={changeTab}>
        {screens[tab] ?? <Dashboard onNavigate={changeTab} onOpenEvaluations={() => openPromptTab('evals')} />}
      </AppShell>
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
