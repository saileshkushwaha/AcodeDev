import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { useTheme } from '@acode/ui';
import type { WorkflowNodeType, WorkflowRunResult } from '@acode/core';
import { WORKFLOW_NODE_WIDTH } from './autoLayout';

export interface WorkflowNodeData {
  nodeType: WorkflowNodeType;
  name: string;
  result: WorkflowRunResult | null;
  onDeleteNode?: (id: string) => void;
}

export const NODE_ICONS: Record<string, string> = {
  input: '📥',
  llm: '🧠',
  transform: '🔧',
  condition: '🔀',
  prompt_template: '📝',
  output: '📤',
  trigger: '⏰',
  http: '🌐',
  fetch: '🔍',
  kv: '💾',
  variables: '🛠️',
  secret: '🔐',
  parallel: '⏳',
  loop: '🔁',
};

function accentFor(nodeType: WorkflowNodeType, tokens: {
  primary: string;
  success: string;
  warning: string;
  info: string;
  danger: string;
}): string {
  switch (nodeType) {
    case 'llm':
      return tokens.primary;
    case 'condition':
      return tokens.warning;
    case 'input':
      return tokens.info;
    case 'output':
      return tokens.success;
    default:
      return tokens.info;
  }
}

export const WorkflowNodeCard = memo(function WorkflowNodeCard({ id, data, selected }: NodeProps<WorkflowNodeData>) {
  const { tokens } = useTheme();
  const isInput = data.nodeType === 'input';
  const isOutput = data.nodeType === 'output';
  const result = data.result;
  const accent = accentFor(data.nodeType, tokens);
  const statusColor = result ? (result.status === 'error' ? tokens.danger : tokens.success) : undefined;

  const shell: React.CSSProperties = {
    width: WORKFLOW_NODE_WIDTH,
    boxSizing: 'border-box',
    border: `1px solid ${selected ? tokens.primary : tokens.borderStrong}`,
    borderRadius: 12,
    background: selected ? `${tokens.primary}0d` : tokens.surface,
    boxShadow: selected ? `0 0 0 2px ${tokens.primary}33` : tokens.shadowSm,
    padding: '10px 12px 12px',
    cursor: 'grab',
  };

  return (
    <div style={shell}>
      {!isInput && (
        <Handle
          type="target"
          position={Position.Top}
          id="in"
          style={{ background: tokens.bg, border: `1px solid ${accent}`, width: 10, height: 10 }}
        />
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 11,
            fontWeight: 700,
            color: accent,
            background: `${accent}1a`,
            border: `1px solid ${accent}33`,
            borderRadius: tokens.radiusFull,
            padding: '1px 8px',
            letterSpacing: 0.3,
          }}
        >
          <span>{NODE_ICONS[data.nodeType] ?? '🔁'}</span>
          <span>{data.nodeType}</span>
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {result && (
            <span style={{ fontSize: 11, color: result.status === 'error' ? tokens.danger : tokens.success, fontWeight: 700, whiteSpace: 'nowrap' }}>
              {result.status === 'error' ? '✕' : `✓ ${result.durationMs}ms`}
            </span>
          )}
          {data.onDeleteNode && !isInput && !isOutput && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                data.onDeleteNode?.(id);
              }}
              title="Delete node"
              style={{
                width: 18,
                height: 18,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: `1px solid ${tokens.borderStrong}`,
                borderRadius: 6,
                background: tokens.surface,
                color: tokens.textMuted,
                cursor: 'pointer',
                fontSize: 12,
                lineHeight: 1,
                padding: 0,
                fontFamily: tokens.fontSans,
                opacity: 0.75,
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: 13,
          fontWeight: 600,
          color: tokens.text,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={data.name}
      >
        {data.name}
      </div>
      {!statusColor && (
        <div style={{ marginTop: 4, fontSize: 11, color: tokens.textMuted }}>—</div>
      )}
      {statusColor && (
        <div style={{ marginTop: 4, fontSize: 11, color: statusColor, fontWeight: 600 }}>
          {result?.status === 'error' ? 'failed' : 'ok'}
        </div>
      )}
      {!isOutput && (
        <Handle
          type="source"
          position={Position.Bottom}
          id="out"
          style={{ background: tokens.bg, border: `1px solid ${accent}`, width: 10, height: 10 }}
        />
      )}
    </div>
  );
}, (prev, next) =>
  prev.selected === next.selected &&
  prev.data.nodeType === next.data.nodeType &&
  prev.data.name === next.data.name &&
  prev.data.result === next.data.result &&
  prev.data.onDeleteNode === next.data.onDeleteNode);