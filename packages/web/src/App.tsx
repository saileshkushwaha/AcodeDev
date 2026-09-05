import React, { useState, useCallback } from 'react';
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

const VALID_TABS = ['dashboard', 'chat', 'workflows', 'prompts', 'agents', 'keys', 'github'];
const TAB_KEY = 'acode.ui.tab';

export function App() {
  const [tab, setTab] = useState(() => {
    const t = readRaw(TAB_KEY);
    return t && VALID_TABS.includes(t) ? t : 'dashboard';
  });
  const [promptIntent, setPromptIntent] = useState<{ tab: 'prompts' | 'evals'; key: number }>({ tab: 'prompts', key: 0 });
  const { tokens } = useTheme();

  // Persist the active screen so a reload returns to where the user left off.
  const changeTab = useCallback((t: string) => {
    setTab(t);
    writeRaw(TAB_KEY, t);
  }, []);

  // Open the Prompts screen on a specific sub-tab (Dashboard "Run eval" opens Evals).
  const openPromptTab = (t: 'prompts' | 'evals') => {
    changeTab('prompts');
    setPromptIntent((p) => ({ tab: t, key: p.key + 1 }));
  };

  const screens: Record<string, React.ReactNode> = {
    dashboard: <Dashboard onNavigate={changeTab} onOpenEvaluations={() => openPromptTab('evals')} />,
    chat: <ChatScreen onNavigate={changeTab} />,
    workflows: <WorkflowsScreen onNavigate={changeTab} />,
    prompts: <PromptsScreen key={promptIntent.key} initialTab={promptIntent.tab} onNavigate={changeTab} />,
    agents: <AgentsScreen />,
    keys: <KeysScreen />,
    github: <GitHubScreen />,
  };

  return (
    <div style={{ fontFamily: tokens.fontSans, background: tokens.bg, color: tokens.text, minHeight: '100vh' }}>
      <AppShell active={tab} onSelect={changeTab}>
        {screens[tab] ?? <Dashboard onNavigate={changeTab} onOpenEvaluations={() => openPromptTab('evals')} />}
      </AppShell>
    </div>
  );
}
