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
  const [promptIntent, setPromptIntent] = useState<{ tab: 'prompts' | 'evals'; key: number }>({ tab: 'prompts', key: 0 });
  const { tokens } = useTheme();

  // Open the Prompts screen on a specific sub-tab (Dashboard "Run eval" opens Evals).
  const openPromptTab = (t: 'prompts' | 'evals') => {
    setTab('prompts');
    setPromptIntent((p) => ({ tab: t, key: p.key + 1 }));
  };

  const screens: Record<string, React.ReactNode> = {
    dashboard: <Dashboard onNavigate={setTab} onOpenEvaluations={() => openPromptTab('evals')} />,
    chat: <ChatScreen onNavigate={setTab} />,
    workflows: <WorkflowsScreen />,
    prompts: <PromptsScreen key={promptIntent.key} initialTab={promptIntent.tab} onNavigate={setTab} />,
    agents: <AgentsScreen />,
    keys: <KeysScreen />,
    github: <GitHubScreen />,
  };

  return (
    <div style={{ fontFamily: tokens.fontSans, background: tokens.bg, color: tokens.text, minHeight: '100vh' }}>
      <AppShell active={tab} onSelect={setTab}>
        {screens[tab] ?? <Dashboard onNavigate={setTab} onOpenEvaluations={() => openPromptTab('evals')} />}
      </AppShell>
    </div>
  );
}
