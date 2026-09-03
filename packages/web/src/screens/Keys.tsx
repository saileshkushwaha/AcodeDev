import { useState } from 'react';
import { useApp } from '../state/AppProvider';
import { Page, PageHeader } from '../components/Page';
import { Card, Button, Input, Badge, useTheme } from '@acode/ui';
import { KNOWN_PROVIDER_KEYS, maskKey, PROVIDER_LIST, type ProviderId } from '@acode/core';

export function KeysScreen() {
  const { tokens } = useTheme();
  const { vault } = useApp();
  const [inputs, setInputs] = useState<Partial<Record<ProviderId, string>>>({});

  // force re-render after mutations
  const [, force] = useState(0);
  const refresh = () => force((x) => x + 1);

  const setInput = (p: ProviderId, v: string) => setInputs((s) => ({ ...s, [p]: v }));

  return (
    <Page maxWidth={1000}>
      <PageHeader
        title="API Keys"
        subtitle="Securely store and switch between provider keys. Keys are encrypted in local storage."
        actions={<Button variant="ghost" onClick={() => { vault.clear(); refresh(); }}>Clear all</Button>}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.space4 }}>
        {KNOWN_PROVIDER_KEYS.map((k) => {
          const stored = vault.getKey(k.provider);
          const inputVal = inputs[k.provider] ?? '';
          return (
            <Card key={k.provider} title={k.field} subtitle={PROVIDER_LIST.find((p) => p.id === k.provider)?.name}>
              <div style={{ display: 'flex', gap: tokens.space3, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 260 }}>
                  <Input
                    type="password"
                    placeholder={stored ? `${maskKey(stored)} (saved)` : k.placeholder}
                    value={inputVal}
                    onChange={(v) => setInput(k.provider, v)}
                    monospace
                    hint={<a href={k.doc} target="_blank" rel="noreferrer" style={{ color: tokens.primary }}>Get key · {k.doc}</a>}
                  />
                </div>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setInput(k.provider, '');
                    vault.setKey(k.provider, inputVal);
                    refresh();
                  }}
                  disabled={!inputVal}
                >
                  Save
                </Button>
                {stored ? (
                  <>
                    <Badge color={tokens.success}>✓ connected</Badge>
                    <Button variant="ghost" onClick={() => { vault.removeKey(k.provider); refresh(); }}>Remove</Button>
                  </>
                ) : (
                  <Badge>not set</Badge>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </Page>
  );
}
