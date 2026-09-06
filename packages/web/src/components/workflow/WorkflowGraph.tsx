import React, { useCallback, useEffect, useMemo } from 'react';
import ReactFlow, {
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  MarkerType,
  ConnectionLineType,
  useReactFlow,
  type Connection,
  type Edge as RFEdge,
  type Node as RFNode,
  type NodeTypes,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { useTheme } from '@acode/ui';
import type { WorkflowEdge, WorkflowNode, WorkflowRunResult } from '@acode/core';
import { WorkflowNodeCard, type WorkflowNodeData } from './WorkflowNodeCard';

export interface XYPos {
  x: number;
  y: number;
}

export interface WorkflowGraphProps {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  selectedNodeId: string | null;
  running: boolean;
  runResultByNode: Map<string, WorkflowRunResult>;
  /** Bump to re-fit the viewport (used after auto-layout or workflow load). */
  fitKey: number;
  onPositionsChange: (updates: Record<string, XYPos>) => void;
  onAddEdge: (edge: WorkflowEdge) => void;
  onRemoveEdges: (ids: string[]) => void;
  onSelectNode: (id: string | null) => void;
  onDeleteNode: (id: string) => void;
}

const nodeTypes: NodeTypes = { workflow: WorkflowNodeCard as unknown as NodeTypes['workflow'] };

let edgeSeq = 0;

function GraphCanvas({
  nodes,
  edges,
  selectedNodeId,
  running,
  runResultByNode,
  fitKey,
  onPositionsChange,
  onAddEdge,
  onRemoveEdges,
  onSelectNode,
  onDeleteNode,
}: WorkflowGraphProps) {
  const { tokens } = useTheme();
  const { fitView } = useReactFlow();

  const edgeKey = useMemo(() => {
    const seen = new Set<string>();
    for (const e of edges) seen.add(`${e.source}|${e.target}|${e.sourceHandle ?? 'out'}|${e.targetHandle ?? 'in'}`);
    return seen;
  }, [edges]);

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      const posUpdates: Record<string, XYPos> = {};
      let removed: string | null = null;
      let selected: string | null = null;
      let deselected: string | null = null;
      for (const ch of changes) {
        if (ch.type === 'position' && ch.position) {
          posUpdates[ch.id] = { x: ch.position.x, y: ch.position.y };
        } else if (ch.type === 'remove') {
          removed = ch.id;
        } else if (ch.type === 'select') {
          if (ch.selected) selected = ch.id;
          else deselected = ch.id;
        }
      }
      if (removed) onDeleteNode(removed);
      const keys = Object.keys(posUpdates);
      if (keys.length > 0) onPositionsChange(posUpdates);
      if (selected) onSelectNode(selected);
      else if (deselected) onSelectNode(null);
    },
    [onDeleteNode, onPositionsChange, onSelectNode],
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      const removed = changes.filter((c) => c.type === 'remove').map((c) => c.id);
      if (removed.length > 0) onRemoveEdges(removed);
    },
    [onRemoveEdges],
  );

  const onConnect: OnConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target || conn.source === conn.target) return;
      const key = `${conn.source}|${conn.target}|${conn.sourceHandle ?? 'out'}|${conn.targetHandle ?? 'in'}`;
      if (edgeKey.has(key)) return;
      onAddEdge({
        id: `e_c_${Date.now().toString(36)}_${++edgeSeq}`,
        source: conn.source,
        target: conn.target,
        sourceHandle: conn.sourceHandle ?? 'out',
        targetHandle: conn.targetHandle ?? 'in',
      });
    },
    [edgeKey, onAddEdge],
  );

  const rfNodes: RFNode<WorkflowNodeData>[] = useMemo(
    () =>
      nodes.map((n) => ({
        id: n.id,
        type: 'workflow',
        position: n.position,
        selected: n.id === selectedNodeId,
        data: { nodeType: n.type, name: n.name, result: runResultByNode.get(n.id) ?? null, onDeleteNode },
      })),
    [nodes, selectedNodeId, runResultByNode, onDeleteNode],
  );

  const rfEdges: RFEdge[] = useMemo(() => {
    const ids = new Set(nodes.map((n) => n.id));
    return edges
      .filter((e) => ids.has(e.source) && ids.has(e.target))
      .map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? 'out',
        targetHandle: e.targetHandle ?? 'in',
        type: 'smoothstep',
        animated: running,
        markerEnd: { type: MarkerType.ArrowClosed, color: tokens.borderStrong, width: 16, height: 16 },
        style: { stroke: running ? tokens.primary : tokens.borderStrong, strokeWidth: 1.6 },
      }));
  }, [edges, nodes, running, tokens]);

  useEffect(() => {
    if (nodes.length === 0) return;
    const t = setTimeout(() => {
      fitView({ padding: 0.2, duration: 0 });
    }, 60);
    return () => clearTimeout(t);
  }, [fitKey, fitView, nodes.length]);

  return (
    <div style={{ height: 520, position: 'relative', borderRadius: 12, overflow: 'hidden', border: `1px solid ${tokens.border}` }}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        deleteKeyCode={['Backspace', 'Delete']}
        connectionLineType={ConnectionLineType.SmoothStep}
        minZoom={0.2}
        maxZoom={2}
        defaultEdgeOptions={{ type: 'smoothstep' }}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} color={tokens.border} />
        <Controls showInteractive={false} style={{ boxShadow: tokens.shadowMd }} />
        <MiniMap
          pannable
          zoomable
          nodeColor={tokens.primary}
          maskColor={`${tokens.bg}88`}
          style={{ background: tokens.surface, border: `1px solid ${tokens.borderStrong}` }}
        />
      </ReactFlow>
      {nodes.length === 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            fontSize: 13,
            color: tokens.textMuted,
          }}
        >
          No nodes yet — add one from the toolbar above to start building your flow.
        </div>
      )}
    </div>
  );
}

export function WorkflowGraph(props: WorkflowGraphProps) {
  return (
    <ReactFlowProvider>
      <GraphCanvas {...props} />
    </ReactFlowProvider>
  );
}
