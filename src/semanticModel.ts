import { MarkerType } from '@xyflow/react'
import { initialEdges, initialNodes } from './initialData'
import { hierarchyEdge, topicNode } from './mindMapData'
import type { DiagramEdge, DiagramNode, SemanticEntity, SemanticModel, SemanticRelation, ViewSnapshot } from './types'

const ROOT_ID = 'mind-context'

const relationSpec: Record<string, Pick<SemanticEntity, 'parentId' | 'order' | 'direction'>> = {
  'mind-context': { parentId: null, order: 0 },
  body: { parentId: ROOT_ID, order: 0, direction: 'left' },
  function: { parentId: ROOT_ID, order: 1, direction: 'left' },
  principle: { parentId: 'function', order: 0, direction: 'left' },
  matter: { parentId: ROOT_ID, order: 0, direction: 'right' },
  'principle-title': { parentId: 'matter', order: 0, direction: 'right' },
  'mirror-left-label': { parentId: 'principle-title', order: 0, direction: 'right' },
  'lamp-label': { parentId: 'principle-title', order: 1, direction: 'right' },
  'mirror-right-label': { parentId: 'principle-title', order: 2, direction: 'right' },
  'all-title': { parentId: 'principle-title', order: 3, direction: 'right' },
  'heart-heading': { parentId: 'all-title', order: 0, direction: 'right' },
  'context-heading': { parentId: 'all-title', order: 1, direction: 'right' },
}

const baseRelations: SemanticRelation[] = [
  { id: 'semantic-mind-body', sourceId: ROOT_ID, targetId: 'body', kind: 'hierarchy' },
  { id: 'semantic-mind-function', sourceId: ROOT_ID, targetId: 'function', kind: 'hierarchy' },
  { id: 'semantic-mind-matter', sourceId: ROOT_ID, targetId: 'matter', kind: 'hierarchy' },
  { id: 'semantic-function-principle', sourceId: 'function', targetId: 'principle', kind: 'hierarchy' },
  { id: 'semantic-matter-main', sourceId: 'matter', targetId: 'principle-title', kind: 'convergence' },
  { id: 'semantic-principle-main', sourceId: 'principle', targetId: 'principle-title', kind: 'convergence' },
  { id: 'semantic-main-heart-matter', sourceId: 'principle-title', targetId: 'mirror-left-label', kind: 'membership' },
  { id: 'semantic-main-wisdom', sourceId: 'principle-title', targetId: 'lamp-label', kind: 'membership' },
  { id: 'semantic-main-context-matter', sourceId: 'principle-title', targetId: 'mirror-right-label', kind: 'membership' },
  { id: 'semantic-heart-wisdom-mutual', sourceId: 'mirror-left-label', targetId: 'lamp-label', kind: 'mutual', bidirectional: true },
  { id: 'semantic-wisdom-context-mutual', sourceId: 'lamp-label', targetId: 'mirror-right-label', kind: 'mutual', bidirectional: true },
  { id: 'semantic-main-all', sourceId: 'principle-title', targetId: 'all-title', kind: 'progression' },
  { id: 'semantic-all-hearts', sourceId: 'all-title', targetId: 'heart-heading', kind: 'membership' },
  { id: 'semantic-all-contexts', sourceId: 'all-title', targetId: 'context-heading', kind: 'membership' },
]

const relationsForEntities = (entities: SemanticEntity[], supplied?: SemanticRelation[]) => {
  const ids = new Set(entities.map((entity) => entity.id))
  const configured = (supplied?.length ? supplied : baseRelations)
    .filter((relation) => ids.has(relation.sourceId) && ids.has(relation.targetId))
  const pairs = new Set(configured.map((relation) => `${relation.sourceId}>${relation.targetId}`))
  entities.forEach((entity) => {
    if (!entity.parentId || !ids.has(entity.parentId) || pairs.has(`${entity.parentId}>${entity.id}`)) return
    configured.push({
      id: `semantic-edge-${entity.id}`,
      sourceId: entity.parentId,
      targetId: entity.id,
      kind: 'hierarchy',
    })
  })
  return configured
}

export const semanticRelations = (model: SemanticModel) => relationsForEntities(model.entities, model.relations)

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const semanticNodeId = (node: DiagramNode) => node.data.semanticId ?? (node.type === 'textNode' || node.type === 'stackNode' ? node.id : undefined)

const entityFromNode = (node: DiagramNode, fallbackOrder: number): SemanticEntity | null => {
  const id = semanticNodeId(node)
  if (!id) return null
  const relation = relationSpec[id] ?? { parentId: ROOT_ID, order: fallbackOrder, direction: 'right' as const }
  if (node.type === 'stackNode') {
    const upper = node.data.upper ?? ''
    const lower = node.data.lower ?? ''
    return { id, title: [upper, lower].filter(Boolean).join('／'), upper, lower, ...relation }
  }
  return {
    id,
    title: node.data.label ?? '未命名主題',
    subtitle: node.data.secondary,
    ...relation,
  }
}

export const createSemanticModelFromDiagram = (
  diagramNodes: DiagramNode[] = initialNodes,
  baseModel?: SemanticModel,
): SemanticModel => {
  const baseById = new Map((baseModel?.entities ?? []).map((entity) => [entity.id, entity]))
  const entities = diagramNodes
    .filter((node) => node.type === 'textNode' || node.type === 'stackNode')
    .map((node, index) => {
      const entity = entityFromNode(node, index + 20)
      if (!entity) return null
      const base = baseById.get(entity.id)
      return base ? { ...base, ...entity, parentId: base.parentId, order: base.order, direction: base.direction } : entity
    })
    .filter((entity): entity is SemanticEntity => Boolean(entity))

  if (!entities.some((entity) => entity.id === ROOT_ID)) {
    entities.unshift({ id: ROOT_ID, title: '心／境', upper: '心', lower: '境', parentId: null, order: 0 })
  }

  return { version: 1, rootId: ROOT_ID, entities, relations: relationsForEntities(entities, baseModel?.relations) }
}

export const initialSemanticModel = createSemanticModelFromDiagram(initialNodes)

export const updateSemanticEntity = (
  model: SemanticModel,
  id: string,
  patch: Partial<Pick<SemanticEntity, 'title' | 'subtitle' | 'upper' | 'lower' | 'parentId' | 'order' | 'direction'>>,
): SemanticModel => ({
  ...model,
  entities: model.entities.map((entity) => {
    if (entity.id !== id) return entity
    const next = { ...entity, ...patch }
    if (patch.title !== undefined && (entity.upper !== undefined || entity.lower !== undefined)) {
      const parts = patch.title.split(/[／/]/)
      next.upper = parts[0]?.trim() ?? ''
      next.lower = parts.slice(1).join('／').trim()
    }
    if (patch.upper !== undefined || patch.lower !== undefined) {
      next.title = [next.upper, next.lower].filter(Boolean).join('／')
    }
    return next
  }),
})

export const semanticDescendants = (model: SemanticModel, ids: Iterable<string>) => {
  const removed = new Set(ids)
  let changed = true
  while (changed) {
    changed = false
    model.entities.forEach((entity) => {
      if (entity.parentId && removed.has(entity.parentId) && !removed.has(entity.id)) {
        removed.add(entity.id)
        changed = true
      }
    })
  }
  return removed
}

export const removeSemanticEntities = (model: SemanticModel, ids: Iterable<string>): SemanticModel => {
  const removed = semanticDescendants(model, ids)
  removed.delete(model.rootId)
  return {
    ...model,
    entities: model.entities.filter((entity) => !removed.has(entity.id)),
    relations: semanticRelations(model).filter((relation) => !removed.has(relation.sourceId) && !removed.has(relation.targetId)),
  }
}

const diagramNodeForEntity = (entity: SemanticEntity, index: number, nodes: DiagramNode[]): DiagramNode => {
  const parentNode = nodes.find((node) => node.data.semanticId === entity.parentId || node.id === entity.parentId)
  const siblingIndex = Math.max(0, index % 5)
  return {
    id: entity.id,
    type: 'textNode',
    position: parentNode
      ? { x: parentNode.position.x + 210, y: parentNode.position.y + siblingIndex * 68 }
      : { x: 650, y: 1120 + siblingIndex * 58 },
    style: { width: 190 },
    zIndex: 5,
    data: {
      semanticId: entity.id,
      label: entity.title,
      secondary: entity.subtitle,
      fontSize: 24,
      weight: 500,
      align: 'center',
      variant: 'text',
    },
  }
}

export const syncDiagramSnapshot = (snapshot: ViewSnapshot, model: SemanticModel): ViewSnapshot => {
  const byId = new Map(model.entities.map((entity) => [entity.id, entity]))
  const nodes = snapshot.nodes
    .filter((node) => !node.data.semanticId || byId.has(node.data.semanticId))
    .map((node) => {
      const semanticId = semanticNodeId(node)
      const entity = semanticId ? byId.get(semanticId) : undefined
      if (!entity) return node
      if (node.type === 'stackNode') {
        return { ...node, data: { ...node.data, semanticId, upper: entity.upper ?? entity.title, lower: entity.lower ?? '' } }
      }
      return { ...node, data: { ...node.data, semanticId, label: entity.title, secondary: entity.subtitle } }
    })

  model.entities.forEach((entity, index) => {
    if (!nodes.some((node) => node.data.semanticId === entity.id || node.id === entity.id)) {
      nodes.push(diagramNodeForEntity(entity, index, nodes))
    }
  })

  const nodeIds = new Set(nodes.map((node) => node.id))
  return {
    nodes,
    edges: snapshot.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)),
  }
}

const modelDepth = (model: SemanticModel, id: string) => {
  const byId = new Map(model.entities.map((entity) => [entity.id, entity]))
  let depth = 0
  let cursor = byId.get(id)
  const visited = new Set<string>()
  while (cursor?.parentId && !visited.has(cursor.id)) {
    visited.add(cursor.id)
    depth += 1
    cursor = byId.get(cursor.parentId)
  }
  return depth
}

export const balancedMindMapPositions = (model: SemanticModel) => {
  const byId = new Map(model.entities.map((entity) => [entity.id, entity]))
  const children = new Map<string, SemanticEntity[]>()
  model.entities.forEach((entity) => {
    if (!entity.parentId) return
    children.set(entity.parentId, [...(children.get(entity.parentId) ?? []), entity].sort((a, b) => a.order - b.order))
  })
  const rootX = 700
  const rootY = 490
  const positions = new Map<string, { x: number; y: number; direction?: 'left' | 'right' }>()
  positions.set(model.rootId, { x: rootX, y: rootY })

  const directionOf = (entity: SemanticEntity): 'left' | 'right' => {
    if (entity.direction) return entity.direction
    let cursor = entity
    while (cursor.parentId && cursor.parentId !== model.rootId) cursor = byId.get(cursor.parentId) ?? cursor
    return cursor.direction ?? 'right'
  }
  const leafCount = (id: string): number => {
    const list = children.get(id) ?? []
    return list.length ? list.reduce((sum, child) => sum + leafCount(child.id), 0) : 1
  }
  const place = (entity: SemanticEntity, side: 'left' | 'right', depth: number, centerY: number) => {
    const width = depth === 0 ? 175 : 160
    const x = side === 'right' ? rootX + 300 + depth * 235 : rootX - 300 - depth * 235 - width
    positions.set(entity.id, { x, y: centerY - 25, direction: side })
    const list = children.get(entity.id) ?? []
    const total = list.reduce((sum, child) => sum + leafCount(child.id), 0)
    let cursor = centerY - (total * 82) / 2
    list.forEach((child) => {
      const weight = leafCount(child.id)
      place(child, side, depth + 1, cursor + (weight * 82) / 2)
      cursor += weight * 82
    })
  }
  const rootChildren = children.get(model.rootId) ?? []
  ;(['left', 'right'] as const).forEach((side) => {
    const list = rootChildren.filter((entity) => directionOf(entity) === side)
    const total = list.reduce((sum, entity) => sum + leafCount(entity.id), 0)
    let cursor = rootY + 24 - (total * 98) / 2
    list.forEach((entity) => {
      const weight = leafCount(entity.id)
      place(entity, side, 0, cursor + (weight * 98) / 2)
      cursor += weight * 98
    })
  })
  return positions
}

export const originalMindMapPositions = (model: SemanticModel) => {
  const fixed: Record<string, { x: number; y: number }> = {
    'mind-context': { x: 540, y: 55 },
    body: { x: 320, y: 190 },
    function: { x: 650, y: 190 },
    matter: { x: 320, y: 320 },
    principle: { x: 650, y: 320 },
    'principle-title': { x: 505, y: 470 },
    'mirror-left-label': { x: 225, y: 650 },
    'lamp-label': { x: 505, y: 650 },
    'mirror-right-label': { x: 795, y: 650 },
    'all-title': { x: 505, y: 850 },
    'heart-heading': { x: 330, y: 1020 },
    'context-heading': { x: 700, y: 1020 },
  }
  const positions = new Map<string, { x: number; y: number; direction?: 'left' | 'right' }>()
  model.entities.forEach((entity, index) => {
    const known = fixed[entity.id]
    if (known) {
      positions.set(entity.id, { ...known, direction: known.x < 540 ? 'left' : 'right' })
      return
    }
    const parentPosition = entity.parentId ? positions.get(entity.parentId) : undefined
    positions.set(entity.id, {
      x: Math.min(1040, (parentPosition?.x ?? 540) + 230),
      y: Math.min(1090, (parentPosition?.y ?? 850) + 95 + (index % 3) * 58),
      direction: 'right',
    })
  })
  return positions
}

export const syncMindMapSnapshot = (snapshot: ViewSnapshot, model: SemanticModel): ViewSnapshot => {
  const previousById = new Map(snapshot.nodes.map((node) => [node.id, node]))
  const positions = originalMindMapPositions(model)
  const auxiliaryNodes = snapshot.nodes.filter(
    (node) => node.id !== 'paper' && node.data.variant !== 'topic' && !node.data.semanticId,
  )
  const nodes: DiagramNode[] = [
    previousById.get('paper') ?? {
      id: 'paper',
      type: 'artboardNode',
      position: { x: 0, y: 0 },
      style: { width: 1180, height: 1180 },
      selectable: false,
      draggable: false,
      deletable: false,
      zIndex: -10,
      data: { variant: 'artboard' },
    },
    ...auxiliaryNodes,
  ]

  model.entities.forEach((entity) => {
    const previous = previousById.get(entity.id)
    const depth = modelDepth(model, entity.id)
    const position = previous?.position ?? positions.get(entity.id) ?? { x: 700, y: 490 }
    const direction = previous?.data.direction ?? positions.get(entity.id)?.direction ?? entity.direction
    const color = direction === 'left' ? '#526f64' : '#a9472e'
    const width = depth === 0 ? 220 : depth === 1 ? 175 : 160
    const generated = topicNode(entity.id, entity.title, position.x, position.y, width, {
      level: depth,
      direction,
      color,
      fill: depth === 0 ? '#22231f' : depth === 1 ? (direction === 'left' ? '#e4ece7' : '#f3e3db') : '#fbfaf6',
    })
    nodes.push({
      ...generated,
      ...previous,
      position,
      style: { ...generated.style, ...previous?.style },
      data: {
        ...generated.data,
        ...previous?.data,
        semanticId: entity.id,
        label: entity.title,
        secondary: entity.subtitle,
        topicLevel: depth,
        direction,
      },
    })
  })

  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const previousEdges = new Map(snapshot.edges.map((edge) => [edge.id, edge]))
  const entityById = new Map(model.entities.map((entity) => [entity.id, entity]))
  const semanticEdges = semanticRelations(model).flatMap((relation) => {
    if (!nodeById.has(relation.sourceId) || !nodeById.has(relation.targetId)) return []
    const source = nodeById.get(relation.sourceId)
    const target = nodeById.get(relation.targetId)
    const primary = entityById.get(relation.targetId)?.parentId === relation.sourceId
    const horizontal = relation.kind === 'mutual'
    const sourceIsLeft = (source?.position.x ?? 0) < (target?.position.x ?? 0)
    const color = relation.kind === 'mutual' ? '#526f64' : relation.kind === 'convergence' ? '#a9472e' : '#6d6255'
    const generated = hierarchyEdge(relation.id, relation.sourceId, relation.targetId, color, sourceIsLeft ? 'right' : 'left')
    generated.sourceHandle = horizontal ? `${sourceIsLeft ? 'right' : 'left'}-source` : 'bottom-source'
    generated.targetHandle = horizontal ? `${sourceIsLeft ? 'left' : 'right'}-target` : 'top-target'
    generated.markerEnd = relation.kind === 'membership'
      ? undefined
      : { type: MarkerType.ArrowClosed, width: 10, height: 10, color }
    generated.markerStart = relation.bidirectional
      ? { type: MarkerType.ArrowClosed, width: 10, height: 10, color }
      : undefined
    generated.data = {
      ...generated.data,
      kind: primary ? 'hierarchy' : 'relation',
      semanticKind: relation.kind,
      dashed: relation.kind === 'mutual',
      bidirectional: relation.bidirectional,
      branchColor: color,
    }
    const previous = previousEdges.get(relation.id)
    return [{ ...generated, ...previous, id: relation.id, source: relation.sourceId, target: relation.targetId, data: { ...generated.data, ...previous?.data, semanticKind: relation.kind } }]
  })
  const userEdges = snapshot.edges.filter(
    (edge) => !edge.data?.semanticKind && !edge.id.startsWith('semantic-') && nodeById.has(edge.source) && nodeById.has(edge.target),
  )
  return { nodes, edges: [...semanticEdges, ...userEdges] }
}

export const initialDiagramSnapshot: ViewSnapshot = syncDiagramSnapshot({ nodes: clone(initialNodes), edges: clone(initialEdges) }, initialSemanticModel)
export const initialMindMapSnapshot: ViewSnapshot = syncMindMapSnapshot({ nodes: [], edges: [] }, initialSemanticModel)
