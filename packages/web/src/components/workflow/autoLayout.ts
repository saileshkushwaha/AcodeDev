import dagre from 'dagre';
import type { WorkflowEdge, WorkflowNode } from '@acode/core';

export const WORKFLOW_NODE_WIDTH = 220;
export const WORKFLOW_NODE_HEIGHT = 72;

/**
 * True when every node still uses the list editor's sequential
 * `{ x: index, y: 0 }` position marker rather than real canvas
 * coordinates. Used to decide when a freshly loaded workflow needs
 * auto-layout before first render on the graph canvas.
 */
export function isIndexLayout(ns: WorkflowNode[]): boolean {
  if (ns.length === 0) return false;
  return ns.every((n, i) => n.position.y === 0 && n.position.x === i);
}

/**
 * Position nodes as a top-to-bottom DAG using dagre so the canvas shows
 * a clean flow. Returns a new array leaving edge data untouched.
 */
export function layoutWorkflow(ns: WorkflowNode[], es: WorkflowEdge[]): WorkflowNode[] {
  if (ns.length === 0) return ns;
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 96, marginx: 48, marginy: 48 });
  for (const n of ns) g.setNode(n.id, { width: WORKFLOW_NODE_WIDTH, height: WORKFLOW_NODE_HEIGHT });
  for (const e of es) g.setEdge(e.source, e.target);
  dagre.layout(g);
  return ns.map((n) => {
    const pos = g.node(n.id);
    if (!pos || pos.x === undefined || pos.y === undefined) return { ...n };
    return { ...n, position: { x: pos.x - WORKFLOW_NODE_WIDTH / 2, y: pos.y - WORKFLOW_NODE_HEIGHT / 2 } };
  });
}