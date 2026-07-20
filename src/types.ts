import type { Edge, Node } from '@xyflow/react'

export type DiagramNodeData = {
  label?: string
  secondary?: string
  fontSize?: number
  weight?: number
  align?: 'left' | 'center' | 'right'
  vertical?: boolean
  variant?: 'artboard' | 'frame' | 'group' | 'bracket' | 'brace' | 'stack' | 'text' | 'image' | 'topic'
  src?: string
  dashed?: boolean
  rounded?: boolean
  showReference?: boolean
  referenceOpacity?: number
  upper?: string
  lower?: string
  topicLevel?: number
  branchColor?: string
  fill?: string
  textColor?: string
  borderColor?: string
  collapsed?: boolean
  direction?: 'left' | 'right'
  note?: string
  semanticId?: string
  groupName?: string
}

export type DiagramNode = Node<DiagramNodeData>

export type DiagramEdgeData = {
  dashed?: boolean
  bidirectional?: boolean
  kind?: 'free' | 'hierarchy' | 'relation'
  branchColor?: string
  semanticKind?: SemanticRelation['kind']
}

export type DiagramEdge = Edge<DiagramEdgeData>

export type SemanticEntity = {
  id: string
  title: string
  subtitle?: string
  parentId: string | null
  order: number
  direction?: 'left' | 'right'
  upper?: string
  lower?: string
}

export type SemanticModel = {
  version: 1
  rootId: string
  entities: SemanticEntity[]
  relations?: SemanticRelation[]
}

export type SemanticRelation = {
  id: string
  sourceId: string
  targetId: string
  kind: 'hierarchy' | 'convergence' | 'membership' | 'mutual' | 'progression'
  bidirectional?: boolean
}

export type ViewSnapshot = {
  nodes: DiagramNode[]
  edges: DiagramEdge[]
}

export type DiagramFile = {
  version: 2
  title: string
  nodes: DiagramNode[]
  edges: DiagramEdge[]
  semanticModel: SemanticModel
  views: {
    diagram: ViewSnapshot
    mindmap: ViewSnapshot
  }
  workspace?: {
    mode: 'diagram' | 'mindmap'
    mindMapStructure: 'original' | 'balanced' | 'right'
  }
}
