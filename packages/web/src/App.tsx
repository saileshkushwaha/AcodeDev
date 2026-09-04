import React, { useState } from 'react';
import { useTheme } from '@acode/ui';
import { AppShell } from './components/AppShell';
import { Dashboard } from './screens/Dashboard';
import { ChatScreen } from './screens/Chat';
import { WorkflowsScreen } from './screens/Workflows';
import { PromptsScreen } from './screens/Prompts';
import { AgentsScreen } from './screens/Agents';
import { KeysScreen } from './screens/Keys';
import { GitHubScreen } from './screens/GitHub';

export function App() {
  const [tab, setTab] = useState('dashboard');
  const { tokens } = useTheme();

  const screens: Record<string, React.ReactNode> = {
    dashboard: <Dashboard onNavigate={setTab} />,
    chat: <ChatScreen onNavigate={setTab} />,
    workflows: <WorkflowsScreen />,
    prompts: <PromptsScreen />,
    agents: <AgentsScreen />,
    keys: <KeysScreen />,
    github: <GitHubScreen />,
  };

  return (
    <div style={{ fontFamily: tokens.fontSans, background: tokens.bg, color: tokens.text, minHeight: '100vh' }}>
      <AppShell active={tab} onSelect={setTab}>
        {screens[tab] ?? <Dashboard onNavigate={setTab} />}
      </AppShell>
    </div>
  );
}
