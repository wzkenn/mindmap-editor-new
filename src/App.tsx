import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type OnSelectionChangeParams,
} from '@xyflow/react'
import { toPng } from 'html-to-image'
import {
  Braces,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  FileImage,
  Frame,
  GitBranch,
  GripVertical,
  Group,
  ImagePlus,
  LayoutTemplate,
  Link2,
  ListTree,
  Maximize2,
  Network,
  Palette,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  TextCursorInput,
  Trash2,
  Undo2,
  Ungroup,
  Upload,
} from 'lucide-react'
import '@xyflow/react/dist/style.css'
import './styles.css'
import { edgeTypes, nodeTypes } from './nodes'
import { hierarchyEdge, topicNode } from './mindMapData'
import {
  createSemanticModelFromDiagram,
  initialDiagramSnapshot,
  initialMindMapSnapshot,
  initialSemanticModel,
  originalMindMapPositions,
  removeSemanticEntities,
  semanticDescendants,
  semanticRelations,
  syncDiagramSnapshot,
  syncMindMapSnapshot,
  updateSemanticEntity,
} from './semanticModel'
import type { DiagramArtboard, DiagramEdge, DiagramFile, DiagramNode, SemanticModel, ViewSnapshot } from './types'

type WorkspaceMode = 'diagram' | 'mindmap'
type MindMapStructure = 'original' | 'balanced' | 'right'
type HistoryEntry =
  | { kind: 'view'; view: ViewSnapshot; model: SemanticModel }
  | { kind: 'artboard-delete'; artboard: DiagramArtboard; index: number }
type WorkspaceHistory = { undo: HistoryEntry[]; redo: HistoryEntry[] }
type ArtboardHistory = Record<WorkspaceMode, WorkspaceHistory>

const cloneSnapshot = (nodes: DiagramNode[], edges: DiagramEdge[]): ViewSnapshot =>
  JSON.parse(JSON.stringify({ nodes, edges })) as ViewSnapshot
const cloneModel = (model: SemanticModel): SemanticModel => JSON.parse(JSON.stringify(model)) as SemanticModel
const cloneArtboard = (artboard: DiagramArtboard): DiagramArtboard => JSON.parse(JSON.stringify(artboard)) as DiagramArtboard

const createInitialArtboard = (): DiagramArtboard => ({
  id: 'artboard-1',
  name: '原圖畫板',
  semanticModel: cloneModel(initialSemanticModel),
  views: {
    diagram: cloneSnapshot(initialDiagramSnapshot.nodes, initialDiagramSnapshot.edges),
    mindmap: cloneSnapshot(initialMindMapSnapshot.nodes, initialMindMapSnapshot.edges),
  },
  mindMapStructure: 'original',
})

const createBlankArtboard = (index: number): DiagramArtboard => {
  const name = `畫板 ${index}`
  const diagram: ViewSnapshot = {
    nodes: [
      {
        id: 'paper',
        type: 'artboardNode',
        position: { x: 0, y: 0 },
        style: { width: 920, height: 1380 },
        selectable: false,
        draggable: false,
        deletable: false,
        zIndex: -10,
        data: { variant: 'artboard', showReference: false, referenceOpacity: 0.16 },
      },
      {
        id: 'mind-context',
        type: 'textNode',
        position: { x: 335, y: 615 },
        style: { width: 250 },
        zIndex: 5,
        data: { label: name, semanticId: 'mind-context', variant: 'text', fontSize: 30, weight: 600, align: 'center' },
      },
    ],
    edges: [],
  }
  const semanticModel = createSemanticModelFromDiagram(diagram.nodes)
  return {
    id: `artboard-${Date.now()}`,
    name,
    semanticModel,
    views: {
      diagram,
      mindmap: syncMindMapSnapshot({ nodes: [], edges: [] }, semanticModel),
    },
    mindMapStructure: 'original',
  }
}

function IconButton({
  label,
  children,
  onClick,
  disabled,
  accent,
}: {
  label: string
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  accent?: boolean
}) {
  return (
    <button className={`icon-button ${accent ? 'is-accent' : ''}`} onClick={onClick} disabled={disabled} title={label} aria-label={label}>
      {children}
    </button>
  )
}

function Editor() {
  const initialArtboard = useRef(createInitialArtboard())
  const [nodes, setNodes, onNodesChange] = useNodesState<DiagramNode>(initialDiagramSnapshot.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<DiagramEdge>(initialDiagramSnapshot.edges)
  const [, setSemanticModel] = useState<SemanticModel>(initialSemanticModel)
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('diagram')
  const [mindMapStructure, setMindMapStructure] = useState<MindMapStructure>('original')
  const [artboards, setArtboards] = useState<DiagramArtboard[]>([cloneArtboard(initialArtboard.current)])
  const [activeArtboardId, setActiveArtboardId] = useState(initialArtboard.current.id)
  const [pendingDeleteArtboardId, setPendingDeleteArtboardId] = useState<string | null>(null)
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([])
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<string[]>([])
  const [saved, setSaved] = useState(true)
  const [notice, setNotice] = useState('已載入原圖復刻稿')
  const [showLayers, setShowLayers] = useState(true)
  const [showInspector, setShowInspector] = useState(true)
  const [draggedLayerId, setDraggedLayerId] = useState<string | null>(null)
  const [layerDropTargetId, setLayerDropTargetId] = useState<string | null>(null)
  const semanticModelRef = useRef<SemanticModel>(initialSemanticModel)
  const storageReady = useRef(false)

  useEffect(() => {
    const compactLayout = window.matchMedia('(max-width: 760px)')
    const adaptPanels = () => {
      if (compactLayout.matches) {
        setShowLayers(true)
        setShowInspector(false)
      } else {
        setShowLayers(true)
        setShowInspector(true)
      }
    }

    adaptPanels()
    compactLayout.addEventListener('change', adaptPanels)
    return () => compactLayout.removeEventListener('change', adaptPanels)
  }, [])
  const historiesByArtboard = useRef<Record<string, ArtboardHistory>>({
    [initialArtboard.current.id]: {
      diagram: { undo: [], redo: [] },
      mindmap: { undo: [], redo: [] },
    },
  })
  const artboardsRef = useRef<DiagramArtboard[]>([cloneArtboard(initialArtboard.current)])
  const uploadRef = useRef<HTMLInputElement>(null)
  const backgroundUploadRef = useRef<HTMLInputElement>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const diagramWorkspace = useRef<ViewSnapshot>(cloneSnapshot(initialDiagramSnapshot.nodes, initialDiagramSnapshot.edges))
  const mindMapWorkspace = useRef<ViewSnapshot>(cloneSnapshot(initialMindMapSnapshot.nodes, initialMindMapSnapshot.edges))
  const flow = useReactFlow<DiagramNode, DiagramEdge>()

  const workspaceHistory = useCallback((artboardId = activeArtboardId, mode = workspaceMode) => {
    historiesByArtboard.current[artboardId] ??= {
      diagram: { undo: [], redo: [] },
      mindmap: { undo: [], redo: [] },
    }
    return historiesByArtboard.current[artboardId][mode]
  }, [activeArtboardId, workspaceMode])

  const selectedNode = nodes.find((node) => selectedNodeIds.length === 1 && node.id === selectedNodeIds[0])
  const selectedEdge = edges.find((edge) => selectedEdgeIds.length === 1 && edge.id === selectedEdgeIds[0])
  const showReference = Boolean(nodes.find((node) => node.id === 'paper')?.data.showReference)

  const syncSnapshot = useCallback((snapshot: ViewSnapshot, mode: WorkspaceMode, model: SemanticModel) =>
    mode === 'diagram' ? syncDiagramSnapshot(snapshot, model) : syncMindMapSnapshot(snapshot, model), [])

  const installSemanticModel = useCallback((nextModel: SemanticModel, activeSnapshot?: ViewSnapshot) => {
    semanticModelRef.current = nextModel
    setSemanticModel(nextModel)
    const current = syncSnapshot(activeSnapshot ?? cloneSnapshot(nodes, edges), workspaceMode, nextModel)
    const otherMode: WorkspaceMode = workspaceMode === 'diagram' ? 'mindmap' : 'diagram'
    const otherSource = otherMode === 'diagram' ? diagramWorkspace.current : mindMapWorkspace.current
    const other = syncSnapshot(otherSource, otherMode, nextModel)
    if (workspaceMode === 'diagram') {
      diagramWorkspace.current = current
      mindMapWorkspace.current = other
    } else {
      mindMapWorkspace.current = current
      diagramWorkspace.current = other
    }
    setNodes(current.nodes)
    setEdges(current.edges)
  }, [edges, nodes, setEdges, setNodes, syncSnapshot, workspaceMode])

  const switchWorkspace = (nextMode: WorkspaceMode) => {
    if (nextMode === workspaceMode) return
    const currentSnapshot = syncSnapshot(cloneSnapshot(nodes, edges), workspaceMode, semanticModelRef.current)
    if (workspaceMode === 'diagram') diagramWorkspace.current = currentSnapshot
    else mindMapWorkspace.current = currentSnapshot

    const targetSource = nextMode === 'diagram' ? diagramWorkspace.current : mindMapWorkspace.current
    const target = syncSnapshot(targetSource, nextMode, semanticModelRef.current)
    if (nextMode === 'diagram') diagramWorkspace.current = target
    else mindMapWorkspace.current = target
    setWorkspaceMode(nextMode)
    setSelectedNodeIds([])
    setSelectedEdgeIds([])
    setNodes(cloneSnapshot(target.nodes, target.edges).nodes)
    setEdges(cloneSnapshot(target.nodes, target.edges).edges)
    setSaved(false)
    setNotice(nextMode === 'mindmap' ? '已進入思維導圖 · Tab 新增子主題' : '已回到原圖復刻工作區')
    setTimeout(() => {
      const focusNodes = nextMode === 'mindmap'
        ? target.nodes.filter((node) => node.data.variant === 'topic' && !node.hidden)
        : target.nodes
      flow.fitView({ nodes: focusNodes, padding: nextMode === 'mindmap' ? 0.2 : 0.08, duration: 450, maxZoom: 1.1 })
    }, 120)
  }

  const markChanged = useCallback((message = '尚未儲存') => {
    setSaved(false)
    setNotice(message)
  }, [])

  useEffect(() => {
    const handleDiagramChange = (event: Event) => {
      const message = event instanceof CustomEvent && typeof event.detail === 'string' ? event.detail : '尚未儲存'
      markChanged(message)
    }
    window.addEventListener('diagram-change', handleDiagramChange)
    return () => window.removeEventListener('diagram-change', handleDiagramChange)
  }, [markChanged])

  useEffect(() => {
    const handleSemanticChange = (event: Event) => {
      if (!(event instanceof CustomEvent)) return
      const detail = event.detail as { nodeId?: string; field?: 'label' | 'upper' | 'lower'; value?: string }
      if (!detail.nodeId || !detail.field || typeof detail.value !== 'string') return
      const node = nodes.find((item) => item.id === detail.nodeId)
      const semanticId = node?.data.semanticId
      if (!semanticId) return
      const history = workspaceHistory()
      history.undo.push({ kind: 'view', view: cloneSnapshot(nodes, edges), model: cloneModel(semanticModelRef.current) })
      if (history.undo.length > 60) history.undo.shift()
      history.redo = []
      const patch = detail.field === 'label' ? { title: detail.value } : { [detail.field]: detail.value }
      installSemanticModel(updateSemanticEntity(semanticModelRef.current, semanticId, patch))
    }
    window.addEventListener('semantic-node-change', handleSemanticChange)
    return () => window.removeEventListener('semantic-node-change', handleSemanticChange)
  }, [edges, installSemanticModel, nodes, workspaceHistory])

  const remember = useCallback(() => {
    const history = workspaceHistory()
    history.undo.push({ kind: 'view', view: cloneSnapshot(nodes, edges), model: cloneModel(semanticModelRef.current) })
    if (history.undo.length > 60) history.undo.shift()
    history.redo = []
  }, [nodes, edges, workspaceHistory])

  const addMindTopic = useCallback(
    (kind: 'child' | 'sibling') => {
      if (workspaceMode !== 'mindmap') return
      const root = nodes.find((node) => node.data.topicLevel === 0)
      if (!root) return

      const active = selectedNode?.data.variant === 'topic' ? selectedNode : root
      const incoming = edges.find((edge) => edge.data?.kind === 'hierarchy' && edge.target === active.id)
      const parent = kind === 'sibling' && incoming
        ? nodes.find((node) => node.id === incoming.source) ?? root
        : active
      const siblings = edges.filter((edge) => edge.data?.kind === 'hierarchy' && edge.source === parent.id)
      const rootCenter = root.position.x + Number(root.style?.width ?? 220) / 2
      const parentCenter = parent.position.x + Number(parent.style?.width ?? 160) / 2
      const direction: 'left' | 'right' = parent.data.topicLevel === 0
        ? mindMapStructure === 'right'
          ? 'right'
          : siblings.filter((edge) => nodes.find((node) => node.id === edge.target)?.data.direction === 'right').length <=
              siblings.filter((edge) => nodes.find((node) => node.id === edge.target)?.data.direction === 'left').length
            ? 'right'
            : 'left'
        : parent.data.direction ?? (parentCenter < rootCenter ? 'left' : 'right')

      const level = (parent.data.topicLevel ?? 0) + 1
      const width = level === 1 ? 170 : 150
      const horizontalGap = level === 1 ? 285 : 235
      const id = `semantic-${Date.now()}`
      const color = direction === 'right' ? '#a9472e' : '#526f64'
      const positionX = direction === 'right'
        ? parent.position.x + Number(parent.style?.width ?? 160) + horizontalGap - width
        : parent.position.x - horizontalGap
      const positionY = parent.position.y + (siblings.length - Math.max(0, siblings.length - 1) / 2) * 72
      const newNode = topicNode(id, kind === 'child' ? '新子主題' : '新同級主題', positionX, positionY, width, {
        level,
        direction,
        color,
        fill: level === 1 ? (direction === 'right' ? '#f3e3db' : '#e4ece7') : '#fbfaf6',
      })
      newNode.selected = true

      remember()
      const parentSemanticId = parent.data.semanticId ?? parent.id
      const nextModel: SemanticModel = {
        ...semanticModelRef.current,
        entities: [
          ...semanticModelRef.current.entities,
          {
            id,
            title: kind === 'child' ? '新子主題' : '新同級主題',
            parentId: parentSemanticId,
            order: siblings.length,
            direction,
          },
        ],
        relations: [
          ...semanticRelations(semanticModelRef.current),
          { id: `semantic-edge-${id}`, sourceId: parentSemanticId, targetId: id, kind: 'hierarchy' },
        ],
      }
      installSemanticModel(nextModel, {
        nodes: [...nodes.map((node) => ({ ...node, selected: false })), newNode],
        edges: [...edges, hierarchyEdge(`semantic-edge-${id}`, parentSemanticId, id, color, direction)],
      })
      setSelectedNodeIds([id])
      setSelectedEdgeIds([])
      markChanged(kind === 'child' ? '已新增子主題' : '已新增同級主題')
      setTimeout(() => flow.fitView({ nodes: [newNode], padding: 2.8, maxZoom: 1.25, duration: 350 }), 80)
    },
    [edges, flow, installSemanticModel, markChanged, mindMapStructure, nodes, remember, selectedNode, workspaceMode],
  )

  const arrangeMindMap = useCallback(
    (structure: MindMapStructure = mindMapStructure) => {
      if (workspaceMode !== 'mindmap') return
      const root = nodes.find((node) => node.data.topicLevel === 0)
      if (!root) return
      const visibleTopics = nodes.filter((node) => node.data.variant === 'topic' && !node.hidden)
      if (structure === 'original') {
        const positions = originalMindMapPositions(semanticModelRef.current)
        const positionedNodes = nodes.map((node) => {
          const next = positions.get(node.id)
          return next
            ? { ...node, position: { x: next.x, y: next.y }, data: { ...node.data, direction: next.direction ?? node.data.direction } }
            : node
        })
        const rebuilt = syncMindMapSnapshot({ nodes: positionedNodes, edges: [] }, semanticModelRef.current)
        remember()
        setMindMapStructure('original')
        setNodes(rebuilt.nodes)
        setEdges(rebuilt.edges)
        markChanged('已恢復原圖縱向關係結構')
        setTimeout(() => flow.fitView({ nodes: visibleTopics, padding: 0.16, duration: 500 }), 100)
        return
      }
      const hierarchy = edges.filter((edge) => edge.data?.kind === 'hierarchy')
      const children = new Map<string, string[]>()
      hierarchy.forEach((edge) => children.set(edge.source, [...(children.get(edge.source) ?? []), edge.target]))
      const byId = new Map(nodes.map((node) => [node.id, node]))
      const rootX = 590
      const rootY = 392
      const positions = new Map<string, { x: number; y: number; direction?: 'left' | 'right' }>()
      positions.set(root.id, { x: rootX, y: rootY })

      const rootChildren = (children.get(root.id) ?? []).filter((id) => byId.get(id) && !byId.get(id)?.hidden)
      const rightRoots = rootChildren.filter((id, index) => structure === 'right' || byId.get(id)?.data.direction === 'right' || (byId.get(id)?.data.direction == null && index % 2 === 0))
      const leftRoots = structure === 'right' ? [] : rootChildren.filter((id) => !rightRoots.includes(id))

      const leafCount = (id: string): number => {
        const list = (children.get(id) ?? []).filter((childId) => !byId.get(childId)?.hidden)
        return list.length ? list.reduce((sum, childId) => sum + leafCount(childId), 0) : 1
      }
      const place = (id: string, side: 'left' | 'right', depth: number, centerY: number) => {
        const node = byId.get(id)
        if (!node) return
        const width = Number(node.style?.width ?? 160)
        const x = side === 'right' ? rootX + 220 + depth * 235 : rootX - depth * 235 - width
        positions.set(id, { x, y: centerY - 24, direction: side })
        const list = (children.get(id) ?? []).filter((childId) => !byId.get(childId)?.hidden)
        const total = list.reduce((sum, childId) => sum + leafCount(childId), 0)
        let cursor = centerY - (total * 82) / 2
        list.forEach((childId) => {
          const weight = leafCount(childId)
          place(childId, side, depth + 1, cursor + (weight * 82) / 2)
          cursor += weight * 82
        })
      }
      const placeSide = (ids: string[], side: 'left' | 'right') => {
        const total = ids.reduce((sum, id) => sum + leafCount(id), 0)
        let cursor = rootY + 24 - (total * 100) / 2
        ids.forEach((id) => {
          const weight = leafCount(id)
          place(id, side, 0, cursor + (weight * 100) / 2)
          cursor += weight * 100
        })
      }
      placeSide(rightRoots, 'right')
      placeSide(leftRoots, 'left')

      remember()
      setMindMapStructure(structure)
      setNodes((current) =>
        current.map((node) => {
          const next = positions.get(node.id)
          return next
            ? { ...node, position: { x: next.x, y: next.y }, data: { ...node.data, direction: next.direction ?? node.data.direction } }
            : node
        }),
      )
      setEdges((current) =>
        current.map((edge) => {
          if (!edge.data?.semanticKind && edge.data?.kind !== 'hierarchy') return edge
          const targetDirection = positions.get(edge.target)?.direction ?? byId.get(edge.target)?.data.direction ?? 'right'
          return {
            ...edge,
            sourceHandle: `${targetDirection}-source`,
            targetHandle: `${targetDirection === 'right' ? 'left' : 'right'}-target`,
          }
        }),
      )
      markChanged(structure === 'balanced' ? '已整理為左右平衡結構' : '已整理為向右邏輯結構')
      setTimeout(() => flow.fitView({ nodes: visibleTopics, padding: 0.18, duration: 500 }), 100)
    },
    [edges, flow, markChanged, mindMapStructure, nodes, remember, setEdges, setNodes, workspaceMode],
  )

  const toggleBranch = () => {
    if (!selectedNode || selectedNode.data.variant !== 'topic') return
    const hierarchy = edges.filter((edge) => edge.data?.kind === 'hierarchy')
    const children = new Map<string, string[]>()
    hierarchy.forEach((edge) => children.set(edge.source, [...(children.get(edge.source) ?? []), edge.target]))
    const collapse = !selectedNode.data.collapsed
    const hiddenIds = new Set<string>()
    const collect = (id: string) => {
      ;(children.get(id) ?? []).forEach((childId) => {
        hiddenIds.add(childId)
        collect(childId)
      })
    }
    collect(selectedNode.id)
    remember()
    setNodes((current) =>
      current.map((node) =>
        node.id === selectedNode.id
          ? { ...node, data: { ...node.data, collapsed: collapse } }
          : hiddenIds.has(node.id)
            ? { ...node, hidden: collapse }
            : node,
      ),
    )
    setEdges((current) => current.map((edge) => (hiddenIds.has(edge.target) ? { ...edge, hidden: collapse } : edge)))
    markChanged(collapse ? '已收起分支' : '已展開分支')
  }

  const applyMindTheme = (theme: 'ink' | 'jade' | 'indigo') => {
    const themes = {
      ink: { root: '#22231f', right: '#a9472e', left: '#526f64', rightFill: '#f3e3db', leftFill: '#e4ece7' },
      jade: { root: '#173f3a', right: '#b66a3c', left: '#2d7b68', rightFill: '#f5e7dc', leftFill: '#deeee9' },
      indigo: { root: '#27304e', right: '#a65369', left: '#526b92', rightFill: '#f3e2e6', leftFill: '#e3e8f1' },
    } as const
    const colors = themes[theme]
    remember()
    setNodes((current) =>
      current.map((node) => {
        if (node.data.variant !== 'topic') return node
        if (node.data.topicLevel === 0) return { ...node, data: { ...node.data, fill: colors.root, textColor: '#fffdf5', borderColor: colors.root } }
        const sideColor = node.data.direction === 'left' ? colors.left : colors.right
        const fill = node.data.topicLevel === 1 ? (node.data.direction === 'left' ? colors.leftFill : colors.rightFill) : '#fbfaf6'
        return { ...node, data: { ...node.data, branchColor: sideColor, borderColor: sideColor, fill } }
      }),
    )
    setEdges((current) => current.map((edge) => edge.data?.kind === 'hierarchy'
      ? { ...edge, data: { ...edge.data, branchColor: nodes.find((node) => node.id === edge.target)?.data.direction === 'left' ? colors.left : colors.right } }
      : edge))
    markChanged('已套用腦圖主題')
  }

  const onConnect = useCallback(
    (connection: Connection) => {
      remember()
      setEdges((current) =>
        addEdge<DiagramEdge>(
          {
            ...connection,
            id: `edge-${Date.now()}`,
            type: 'diagramEdge',
            markerEnd: { type: MarkerType.ArrowClosed, color: '#191a18', width: 16, height: 16 },
            data: { dashed: false, bidirectional: false },
          },
          current,
        ),
      )
      markChanged('已新增連線')
    },
    [markChanged, remember, setEdges],
  )

  const handleSelection = useCallback(({ nodes: selectedNodes, edges: selectedEdges }: OnSelectionChangeParams) => {
    setSelectedNodeIds(selectedNodes.map((node) => node.id))
    setSelectedEdgeIds(selectedEdges.map((edge) => edge.id))
  }, [])

  const updateNode = (patch: Partial<DiagramNode['data']>) => {
    if (!selectedNode) return
    remember()
    const nextNodes = nodes.map((node) => (node.id === selectedNode.id ? { ...node, data: { ...node.data, ...patch } } : node))
    const semanticId = selectedNode.data.semanticId
    if (semanticId && (patch.label !== undefined || patch.secondary !== undefined)) {
      let nextModel = semanticModelRef.current
      if (patch.label !== undefined) nextModel = updateSemanticEntity(nextModel, semanticId, { title: patch.label })
      if (patch.secondary !== undefined) nextModel = updateSemanticEntity(nextModel, semanticId, { subtitle: patch.secondary })
      installSemanticModel(nextModel, { nodes: nextNodes, edges })
    } else {
      setNodes(nextNodes)
    }
    markChanged()
  }

  const updateEdge = (patch: Partial<NonNullable<DiagramEdge['data']>>) => {
    if (!selectedEdge) return
    remember()
    setEdges((current) =>
      current.map((edge) => {
        if (edge.id !== selectedEdge.id) return edge
        const bidirectional = patch.bidirectional ?? edge.data?.bidirectional
        return {
          ...edge,
          data: { ...edge.data, ...patch },
          markerStart: bidirectional
            ? { type: MarkerType.ArrowClosed, color: '#191a18', width: 16, height: 16 }
            : undefined,
        }
      }),
    )
    markChanged()
  }

  const addTextNode = () => {
    remember()
    const center = flow.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
    const id = `semantic-${Date.now()}`
    const newNode: DiagramNode = {
      id,
      type: 'textNode',
      position: { x: center.x - 90, y: center.y - 24 },
      style: { width: 180 },
      data: { semanticId: id, label: '雙擊編輯文字', fontSize: 24, align: 'center', weight: 400, variant: 'text' },
      zIndex: 5,
      selected: true,
    }
    const rootChildren = semanticModelRef.current.entities.filter((entity) => entity.parentId === semanticModelRef.current.rootId)
    const nextModel: SemanticModel = {
      ...semanticModelRef.current,
      entities: [...semanticModelRef.current.entities, {
        id,
        title: '雙擊編輯文字',
        parentId: semanticModelRef.current.rootId,
        order: rootChildren.length,
        direction: 'right',
      }],
    }
    installSemanticModel(nextModel, { nodes: [...nodes.map((node) => ({ ...node, selected: false })), newNode], edges })
    setSelectedNodeIds([id])
    setSelectedEdgeIds([])
    markChanged('已新增文字')
  }

  const addFloatingText = () => {
    remember()
    const center = flow.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
    const id = `floating-text-${Date.now()}`
    setNodes((current) => [
      ...current.map((node) => ({ ...node, selected: false })),
      {
        id,
        type: 'textNode',
        position: { x: center.x - 100, y: center.y - 24 },
        style: { width: 200 },
        data: { label: '雙擊編輯文字', fontSize: 20, align: 'center', weight: 400, variant: 'text' },
        zIndex: 6,
        selected: true,
      },
    ])
    setSelectedNodeIds([id])
    setSelectedEdgeIds([])
    markChanged('已新增自由文字')
  }

  const addFrame = () => {
    remember()
    const center = flow.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
    const id = `frame-${Date.now()}`
    setNodes((current) => [
      ...current.map((node) => ({ ...node, selected: false })),
      {
        id,
        type: 'frameNode',
        position: { x: center.x - 160, y: center.y - 100 },
        style: { width: 320, height: 200 },
        data: { variant: 'frame', dashed: false, rounded: true },
        zIndex: 1,
        selected: true,
      },
    ])
    setSelectedNodeIds([id])
    setSelectedEdgeIds([])
    markChanged('已新增分組框')
  }

  const addImage = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      remember()
      const center = flow.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
      const id = `image-${Date.now()}`
      setNodes((current) => [
        ...current.map((node) => ({ ...node, selected: false })),
        {
          id,
          type: 'imageNode',
          position: { x: center.x - 80, y: center.y - 100 },
          style: { width: 160, height: 200 },
          data: { variant: 'image', src: String(reader.result), label: file.name },
          zIndex: 4,
          selected: true,
        },
      ])
      setSelectedNodeIds([id])
      setSelectedEdgeIds([])
      markChanged('已新增圖片')
    }
    reader.readAsDataURL(file)
  }

  const removeSelected = () => {
    if (!selectedNodeIds.length && !selectedEdgeIds.length) return
    remember()
    const selectedGroups = new Set(
      nodes.filter((node) => selectedNodeIds.includes(node.id) && node.data.variant === 'group').map((node) => node.id),
    )
    const directlyRemovedNodeIds = new Set(
      nodes.filter((node) => selectedNodeIds.includes(node.id) || (node.parentId && selectedGroups.has(node.parentId))).map((node) => node.id),
    )
    const selectedSemanticIds = [...directlyRemovedNodeIds].flatMap((id) => {
      const semanticId = nodes.find((node) => node.id === id)?.data.semanticId
      return semanticId && semanticId !== semanticModelRef.current.rootId ? [semanticId] : []
    })
    const removedSemanticIds = semanticDescendants(semanticModelRef.current, selectedSemanticIds)
    removedSemanticIds.delete(semanticModelRef.current.rootId)
    const idsToRemove = new Set(
      nodes
        .filter((node) => selectedNodeIds.includes(node.id) || (node.parentId && selectedGroups.has(node.parentId)) || (node.data.semanticId && removedSemanticIds.has(node.data.semanticId)))
        .map((node) => node.id),
    )
    idsToRemove.delete('paper')
    idsToRemove.delete(semanticModelRef.current.rootId)
    const removedParents = new Map(nodes.filter((node) => idsToRemove.has(node.id)).map((node) => [node.id, node]))
    const nextView = {
      nodes: nodes
        .filter((node) => !idsToRemove.has(node.id))
        .map((node) => {
          if (!node.parentId || !idsToRemove.has(node.parentId)) return node
          const parent = removedParents.get(node.parentId)
          return {
            ...node,
            position: parent
              ? { x: parent.position.x + node.position.x, y: parent.position.y + node.position.y }
              : node.position,
            parentId: undefined,
            extent: undefined,
            expandParent: undefined,
          }
        }),
      edges: edges.filter((edge) => !selectedEdgeIds.includes(edge.id) && !idsToRemove.has(edge.source) && !idsToRemove.has(edge.target)),
    }
    if (removedSemanticIds.size) {
      installSemanticModel(removeSemanticEntities(semanticModelRef.current, removedSemanticIds), nextView)
    } else {
      setNodes(nextView.nodes)
      setEdges(nextView.edges)
    }
    setSelectedNodeIds([])
    setSelectedEdgeIds([])
    markChanged('已刪除所選元素')
  }

  const groupableNodes = nodes.filter(
    (node) => selectedNodeIds.includes(node.id) && node.id !== 'paper' && !node.parentId && node.data.variant !== 'group',
  )
  const selectedGroupIds = new Set(
    nodes.flatMap((node) => {
      if (!selectedNodeIds.includes(node.id)) return []
      if (node.data.variant === 'group') return [node.id]
      return node.parentId ? [node.parentId] : []
    }),
  )

  const groupSelected = () => {
    if (groupableNodes.length < 2) {
      setNotice('請按住 Shift 或 Command 選取至少兩個未編組元素')
      return
    }
    remember()
    const paddingX = 28
    const paddingTop = 42
    const paddingBottom = 28
    const bounds = groupableNodes.reduce(
      (acc, node) => {
        const width = node.measured?.width ?? Number(node.style?.width ?? 160)
        const height = node.measured?.height ?? Number(node.style?.height ?? 56)
        return {
          minX: Math.min(acc.minX, node.position.x),
          minY: Math.min(acc.minY, node.position.y),
          maxX: Math.max(acc.maxX, node.position.x + width),
          maxY: Math.max(acc.maxY, node.position.y + height),
        }
      },
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
    )
    const groupId = `group-${Date.now()}`
    const groupX = bounds.minX - paddingX
    const groupY = bounds.minY - paddingTop
    const memberIds = new Set(groupableNodes.map((node) => node.id))
    const groupNode: DiagramNode = {
      id: groupId,
      type: 'frameNode',
      position: { x: groupX, y: groupY },
      style: {
        width: bounds.maxX - bounds.minX + paddingX * 2,
        height: bounds.maxY - bounds.minY + paddingTop + paddingBottom,
      },
      data: { variant: 'group', groupName: `編組 ${nodes.filter((node) => node.data.variant === 'group').length + 1}`, dashed: true, rounded: true },
      zIndex: Math.min(...groupableNodes.map((node) => node.zIndex ?? 1)) - 1,
      selected: true,
    }
    const members = groupableNodes.map((node) => ({
      ...node,
      position: { x: node.position.x - groupX, y: node.position.y - groupY },
      parentId: groupId,
      extent: 'parent' as const,
      expandParent: true,
      selected: false,
    }))
    setNodes((current) => {
      const remaining = current.filter((node) => !memberIds.has(node.id))
      const paperIndex = remaining.findIndex((node) => node.id === 'paper')
      const insertAt = paperIndex >= 0 ? paperIndex + 1 : 0
      return [...remaining.slice(0, insertAt), groupNode, ...members, ...remaining.slice(insertAt)]
    })
    setSelectedNodeIds([groupId])
    setSelectedEdgeIds([])
    markChanged(`已將 ${members.length} 個元素編組，可拖動組框整體移動`)
  }

  const ungroupSelected = () => {
    if (!selectedGroupIds.size) {
      setNotice('請先選取組框或組內元素')
      return
    }
    remember()
    setNodes((current) => {
      const groups = new Map(current.filter((node) => selectedGroupIds.has(node.id)).map((node) => [node.id, node]))
      return current
        .filter((node) => !selectedGroupIds.has(node.id))
        .map((node) => {
          if (!node.parentId || !selectedGroupIds.has(node.parentId)) return node
          const parent = groups.get(node.parentId)
          if (!parent) return { ...node, parentId: undefined, extent: undefined, expandParent: undefined }
          return {
            ...node,
            position: { x: parent.position.x + node.position.x, y: parent.position.y + node.position.y },
            parentId: undefined,
            extent: undefined,
            expandParent: undefined,
            selected: true,
          }
        })
    })
    setSelectedNodeIds(nodes.filter((node) => node.parentId && selectedGroupIds.has(node.parentId)).map((node) => node.id))
    setSelectedEdgeIds([])
    markChanged('已取消編組，元素位置保持不變')
  }

  const applyLayerOrder = (orderedIds: string[]) => {
    const order = new Map(orderedIds.map((id, index) => [id, orderedIds.length - index + 1]))
    setNodes((current) => current.map((node) => {
      if (node.id === 'paper') return { ...node, zIndex: -10 }
      const nextZ = order.get(node.id)
      if (nextZ === undefined) return node
      return { ...node, zIndex: node.data.variant === 'group' ? nextZ - 0.5 : nextZ }
    }))
  }

  const moveLayer = (id: string, direction: -1 | 1) => {
    const orderedIds = layerItems.map((item) => item.id)
    const index = orderedIds.indexOf(id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= orderedIds.length) return
    remember()
    ;[orderedIds[index], orderedIds[target]] = [orderedIds[target], orderedIds[index]]
    applyLayerOrder(orderedIds)
    markChanged(direction < 0 ? '圖層已上移' : '圖層已下移')
  }

  const reorderLayer = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return
    const orderedIds = layerItems.map((item) => item.id)
    const sourceIndex = orderedIds.indexOf(sourceId)
    const targetIndex = orderedIds.indexOf(targetId)
    if (sourceIndex < 0 || targetIndex < 0) return
    remember()
    orderedIds.splice(sourceIndex, 1)
    orderedIds.splice(targetIndex, 0, sourceId)
    applyLayerOrder(orderedIds)
    markChanged('已調整圖層順序')
  }

  const toggleReference = () => {
    if (workspaceMode !== 'diagram') return
    remember()
    setNodes((current) =>
      current.map((node) => (node.id === 'paper' ? { ...node, data: { ...node.data, showReference: !showReference } } : node)),
    )
    markChanged(showReference ? '已隱藏原圖底稿' : '已顯示原圖底稿')
  }

  const unifiedViews = useCallback(() => {
    const current = syncSnapshot(cloneSnapshot(nodes, edges), workspaceMode, semanticModelRef.current)
    const diagram = workspaceMode === 'diagram'
      ? current
      : syncDiagramSnapshot(diagramWorkspace.current, semanticModelRef.current)
    const mindmap = workspaceMode === 'mindmap'
      ? current
      : syncMindMapSnapshot(mindMapWorkspace.current, semanticModelRef.current)
    diagramWorkspace.current = diagram
    mindMapWorkspace.current = mindmap
    return { diagram, mindmap }
  }, [edges, nodes, syncSnapshot, workspaceMode])

  const setArtboardCollection = useCallback((next: DiagramArtboard[]) => {
    artboardsRef.current = next
    setArtboards(next)
  }, [])

  const saveActiveArtboardToCollection = useCallback((views = unifiedViews()) => {
    const next = artboardsRef.current.map((artboard) => artboard.id === activeArtboardId
      ? {
          ...artboard,
          semanticModel: cloneModel(semanticModelRef.current),
          views: {
            diagram: cloneSnapshot(views.diagram.nodes, views.diagram.edges),
            mindmap: cloneSnapshot(views.mindmap.nodes, views.mindmap.edges),
          },
          mindMapStructure,
        }
      : artboard)
    setArtboardCollection(next)
    return next
  }, [activeArtboardId, mindMapStructure, setArtboardCollection, unifiedViews])

  const openArtboard = useCallback((target: DiagramArtboard) => {
    const nextBoard = cloneArtboard(target)
    semanticModelRef.current = nextBoard.semanticModel
    setSemanticModel(nextBoard.semanticModel)
    diagramWorkspace.current = cloneSnapshot(nextBoard.views.diagram.nodes, nextBoard.views.diagram.edges)
    mindMapWorkspace.current = cloneSnapshot(nextBoard.views.mindmap.nodes, nextBoard.views.mindmap.edges)
    setMindMapStructure(nextBoard.mindMapStructure)
    setActiveArtboardId(nextBoard.id)
    const active = workspaceMode === 'diagram' ? nextBoard.views.diagram : nextBoard.views.mindmap
    setNodes(cloneSnapshot(active.nodes, active.edges).nodes)
    setEdges(cloneSnapshot(active.nodes, active.edges).edges)
    setSelectedNodeIds([])
    setSelectedEdgeIds([])
    setSaved(false)
    setNotice(`已切換到「${nextBoard.name}」`)
    setTimeout(() => flow.fitView({ padding: workspaceMode === 'mindmap' ? 0.2 : 0.08, duration: 420, maxZoom: 1.1 }), 80)
  }, [flow, setEdges, setNodes, workspaceMode])

  const switchArtboard = useCallback((id: string) => {
    if (id === activeArtboardId) return
    const nextCollection = saveActiveArtboardToCollection()
    const target = nextCollection.find((artboard) => artboard.id === id)
    if (target) openArtboard(target)
  }, [activeArtboardId, openArtboard, saveActiveArtboardToCollection])

  const addArtboard = useCallback(() => {
    const currentCollection = saveActiveArtboardToCollection()
    const nextBoard = createBlankArtboard(currentCollection.length + 1)
    const nextCollection = [...currentCollection, nextBoard]
    setArtboardCollection(nextCollection)
    workspaceHistory(nextBoard.id, 'diagram')
    workspaceHistory(nextBoard.id, 'mindmap')
    openArtboard(nextBoard)
    setNotice(`已新增「${nextBoard.name}」`)
  }, [openArtboard, saveActiveArtboardToCollection, setArtboardCollection, workspaceHistory])

  const deleteArtboard = useCallback((id: string) => {
    if (artboardsRef.current.length <= 1) {
      setNotice('至少需要保留一個畫板')
      return
    }
    const boardIndex = artboardsRef.current.findIndex((artboard) => artboard.id === id)
    const board = artboardsRef.current[boardIndex]
    if (!board) return
    if (pendingDeleteArtboardId !== id) {
      setPendingDeleteArtboardId(id)
      setNotice(`再次點擊刪除，確認移除「${board.name}」及其全部內容`)
      return
    }

    setPendingDeleteArtboardId(null)
    const currentCollection = saveActiveArtboardToCollection()
    const deletedBoard = cloneArtboard(currentCollection.find((artboard) => artboard.id === id) ?? board)
    const deletionEntry: HistoryEntry = { kind: 'artboard-delete', artboard: deletedBoard, index: boardIndex }
    const nextCollection = currentCollection.filter((artboard) => artboard.id !== id)
    setArtboardCollection(nextCollection)
    const historyOwner = id === activeArtboardId
      ? nextCollection[Math.min(boardIndex, nextCollection.length - 1)]
      : nextCollection.find((artboard) => artboard.id === activeArtboardId) ?? nextCollection[0]
    const history = workspaceHistory(historyOwner.id, workspaceMode)
    history.undo.push(deletionEntry)
    history.redo = []
    if (id === activeArtboardId) {
      openArtboard(historyOwner)
    }
    setSaved(false)
    setNotice(`已刪除「${board.name}」`)
  }, [activeArtboardId, openArtboard, pendingDeleteArtboardId, saveActiveArtboardToCollection, setArtboardCollection, workspaceHistory, workspaceMode])

  useEffect(() => {
    if (!pendingDeleteArtboardId) return
    const timer = window.setTimeout(() => setPendingDeleteArtboardId(null), 4000)
    return () => window.clearTimeout(timer)
  }, [pendingDeleteArtboardId])

  const undo = useCallback(() => {
    const history = workspaceHistory()
    const previous = history.undo.pop()
    if (!previous) return
    if (previous.kind === 'artboard-delete') {
      const currentCollection = saveActiveArtboardToCollection()
      const nextCollection = [...currentCollection]
      nextCollection.splice(Math.min(previous.index, nextCollection.length), 0, cloneArtboard(previous.artboard))
      setArtboardCollection(nextCollection)
      const restoredHistory = workspaceHistory(previous.artboard.id, workspaceMode)
      restoredHistory.redo.push(previous)
      openArtboard(previous.artboard)
      markChanged(`已復原刪除「${previous.artboard.name}」`)
      return
    }
    history.redo.push({ kind: 'view', view: cloneSnapshot(nodes, edges), model: cloneModel(semanticModelRef.current) })
    installSemanticModel(previous.model, previous.view)
    markChanged('已復原上一步')
  }, [edges, installSemanticModel, markChanged, nodes, openArtboard, saveActiveArtboardToCollection, setArtboardCollection, workspaceHistory, workspaceMode])

  const redo = useCallback(() => {
    const history = workspaceHistory()
    const next = history.redo.pop()
    if (!next) return
    if (next.kind === 'artboard-delete') {
      const currentCollection = saveActiveArtboardToCollection()
      if (currentCollection.length <= 1) return
      const restoredIndex = currentCollection.findIndex((artboard) => artboard.id === next.artboard.id)
      const nextCollection = currentCollection.filter((artboard) => artboard.id !== next.artboard.id)
      setArtboardCollection(nextCollection)
      const fallback = nextCollection[Math.min(Math.max(restoredIndex, 0), nextCollection.length - 1)]
      const fallbackHistory = workspaceHistory(fallback.id, workspaceMode)
      fallbackHistory.undo.push(next)
      openArtboard(fallback)
      markChanged(`已重做刪除「${next.artboard.name}」`)
      return
    }
    history.undo.push({ kind: 'view', view: cloneSnapshot(nodes, edges), model: cloneModel(semanticModelRef.current) })
    installSemanticModel(next.model, next.view)
    markChanged('已重做')
  }, [edges, installSemanticModel, markChanged, nodes, openArtboard, saveActiveArtboardToCollection, setArtboardCollection, workspaceHistory, workspaceMode])

  const uploadArtboardBackground = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      setNotice('請選擇圖片格式的底圖')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const backgroundSrc = String(reader.result)
      const withBackground = (snapshot: ViewSnapshot): ViewSnapshot => ({
        ...snapshot,
        nodes: snapshot.nodes.map((node) => node.id === 'paper'
          ? { ...node, data: { ...node.data, backgroundSrc, backgroundOpacity: 0.34 } }
          : node),
      })
      diagramWorkspace.current = withBackground(diagramWorkspace.current)
      mindMapWorkspace.current = withBackground(mindMapWorkspace.current)
      setNodes((current) => current.map((node) => node.id === 'paper'
        ? { ...node, data: { ...node.data, backgroundSrc, backgroundOpacity: 0.34 } }
        : node))
      markChanged(`已為目前畫板套用底圖「${file.name}」`)
      if (backgroundUploadRef.current) backgroundUploadRef.current.value = ''
    }
    reader.readAsDataURL(file)
  }, [markChanged, setNodes])

  const writeLocalFile = useCallback((message?: string) => {
    const views = unifiedViews()
    const nextArtboards = saveActiveArtboardToCollection(views)
    const active = workspaceMode === 'diagram' ? views.diagram : views.mindmap
    const file: DiagramFile = {
      version: 2,
      title: '心境圖譜',
      nodes: active.nodes,
      edges: active.edges,
      semanticModel: semanticModelRef.current,
      views,
      workspace: { mode: workspaceMode, mindMapStructure },
      artboards: nextArtboards,
      activeArtboardId,
    }
    try {
      localStorage.setItem('jing-lamp-unified', JSON.stringify(file))
      setSaved(true)
      if (message) setNotice(message)
      return true
    } catch {
      setSaved(false)
      setNotice('本機儲存空間不足，請先匯出 JSON 備份')
      return false
    }
  }, [activeArtboardId, mindMapStructure, saveActiveArtboardToCollection, unifiedViews, workspaceMode])

  const saveLocal = () => writeLocalFile('已手動儲存到本機')

  const restoreLocal = (automatic = false) => {
    const raw = localStorage.getItem('jing-lamp-unified') ?? localStorage.getItem('jing-lamp-diagram')
    if (!raw) {
      if (!automatic) setNotice('尚無瀏覽器存檔')
      return false
    }
    try {
      const file = JSON.parse(raw) as Partial<DiagramFile> & { nodes?: DiagramNode[]; edges?: DiagramEdge[] }
      const restoredMode = file.workspace?.mode === 'mindmap' ? 'mindmap' : 'diagram'
      const restoredStructure = file.workspace?.mindMapStructure
      const legacyMindMap = !file.semanticModel?.relations?.length
      const model = file.semanticModel ?? createSemanticModelFromDiagram(file.nodes ?? initialDiagramSnapshot.nodes, initialSemanticModel)
      const diagramSource = file.views?.diagram ?? (restoredMode === 'diagram' && file.nodes && file.edges
        ? { nodes: file.nodes, edges: file.edges }
        : initialDiagramSnapshot)
      const mindmapSource = legacyMindMap
        ? { nodes: [], edges: [] }
        : file.views?.mindmap ?? (restoredMode === 'mindmap' && file.nodes && file.edges
        ? { nodes: file.nodes, edges: file.edges }
        : initialMindMapSnapshot)
      const diagram = syncDiagramSnapshot(diagramSource, model)
      const mindmap = syncMindMapSnapshot(mindmapSource, model)
      if (!automatic) remember()
      const legacyBoard: DiagramArtboard = {
        id: 'artboard-1',
        name: '原圖畫板',
        semanticModel: model,
        views: { diagram, mindmap },
        mindMapStructure: restoredStructure === 'balanced' || restoredStructure === 'right' ? restoredStructure : 'original',
      }
      const restoredArtboards = file.artboards?.length
        ? file.artboards.map((artboard) => ({
            ...cloneArtboard(artboard),
            views: {
              diagram: syncDiagramSnapshot(artboard.views.diagram, artboard.semanticModel),
              mindmap: syncMindMapSnapshot(artboard.views.mindmap, artboard.semanticModel),
            },
          }))
        : [legacyBoard]
      const restoredBoard = restoredArtboards.find((artboard) => artboard.id === file.activeArtboardId) ?? restoredArtboards[0]
      setArtboardCollection(restoredArtboards)
      setActiveArtboardId(restoredBoard.id)
      historiesByArtboard.current = Object.fromEntries(restoredArtboards.map((artboard) => [artboard.id, {
        diagram: { undo: [], redo: [] },
        mindmap: { undo: [], redo: [] },
      }]))
      semanticModelRef.current = restoredBoard.semanticModel
      setSemanticModel(restoredBoard.semanticModel)
      diagramWorkspace.current = restoredBoard.views.diagram
      mindMapWorkspace.current = restoredBoard.views.mindmap
      setWorkspaceMode(restoredMode)
      setMindMapStructure(restoredBoard.mindMapStructure)
      const active = restoredMode === 'diagram' ? restoredBoard.views.diagram : restoredBoard.views.mindmap
      setNodes(active.nodes)
      setEdges(active.edges)
      setSaved(true)
      setNotice(automatic ? '已自動恢復上次編輯' : '已載入本機存檔，兩種視圖已同步')
      setTimeout(() => flow.fitView({ padding: restoredMode === 'mindmap' ? 0.2 : 0.08, duration: 350, maxZoom: 1.1 }), 0)
      return true
    } catch {
      setNotice('存檔格式無法讀取')
      return false
    }
  }

  useEffect(() => {
    if (storageReady.current) return
    restoreLocal(true)
    storageReady.current = true
  }, [])

  useEffect(() => {
    if (!storageReady.current || saved) return
    const timer = window.setTimeout(() => writeLocalFile('已自動儲存到本機'), 600)
    return () => window.clearTimeout(timer)
  }, [edges, mindMapStructure, nodes, saved, workspaceMode, writeLocalFile])

  useEffect(() => {
    const saveBeforeLeaving = () => {
      if (storageReady.current && !saved) writeLocalFile()
    }
    window.addEventListener('pagehide', saveBeforeLeaving)
    return () => window.removeEventListener('pagehide', saveBeforeLeaving)
  }, [saved, writeLocalFile])

  const resetDiagram = () => {
    remember()
    setSelectedNodeIds([])
    setSelectedEdgeIds([])
    const model = cloneModel(initialSemanticModel)
    const diagram = syncDiagramSnapshot(cloneSnapshot(initialDiagramSnapshot.nodes, initialDiagramSnapshot.edges), model)
    const mindmap = syncMindMapSnapshot(cloneSnapshot(initialMindMapSnapshot.nodes, initialMindMapSnapshot.edges), model)
    semanticModelRef.current = model
    setSemanticModel(model)
    diagramWorkspace.current = diagram
    mindMapWorkspace.current = mindmap
    const source = workspaceMode === 'mindmap' ? mindmap : diagram
    setMindMapStructure('original')
    setNodes(source.nodes)
    setEdges(source.edges)
    markChanged('已依目前圖譜重置統一語義模型')
    setTimeout(() => {
      const focusNodes = workspaceMode === 'mindmap'
        ? source.nodes.filter((node) => node.data.variant === 'topic')
        : source.nodes
      flow.fitView({ nodes: focusNodes, padding: workspaceMode === 'mindmap' ? 0.2 : 0.08, duration: 500, maxZoom: 1.1 })
    }, 120)
  }

  const exportJson = () => {
    const views = unifiedViews()
    const nextArtboards = saveActiveArtboardToCollection(views)
    const active = workspaceMode === 'diagram' ? views.diagram : views.mindmap
    const file: DiagramFile = {
      version: 2,
      title: '心境圖譜',
      nodes: active.nodes,
      edges: active.edges,
      semanticModel: semanticModelRef.current,
      views,
      workspace: { mode: workspaceMode, mindMapStructure },
      artboards: nextArtboards,
      activeArtboardId,
    }
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = '心境圖譜-統一模型.json'
    anchor.click()
    URL.revokeObjectURL(url)
    setNotice('已匯出可再次編輯的 JSON')
  }

  const importJson = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const fileData = JSON.parse(String(reader.result)) as Partial<DiagramFile> & { nodes?: DiagramNode[]; edges?: DiagramEdge[] }
        if (!Array.isArray(fileData.nodes) || !Array.isArray(fileData.edges)) throw new Error('invalid')
        const model = fileData.semanticModel ?? createSemanticModelFromDiagram(fileData.nodes, initialSemanticModel)
        const diagramSource = fileData.views?.diagram ?? { nodes: fileData.nodes, edges: fileData.edges }
        const diagram = syncDiagramSnapshot(diagramSource, model)
        const mindmapSource = fileData.semanticModel?.relations?.length ? fileData.views?.mindmap ?? initialMindMapSnapshot : { nodes: [], edges: [] }
        const mindmap = syncMindMapSnapshot(mindmapSource, model)
        remember()
        const importedBoards: DiagramArtboard[] = fileData.artboards?.length
          ? fileData.artboards.map((artboard) => ({
              ...cloneArtboard(artboard),
              views: {
                diagram: syncDiagramSnapshot(artboard.views.diagram, artboard.semanticModel),
                mindmap: syncMindMapSnapshot(artboard.views.mindmap, artboard.semanticModel),
              },
            }))
          : [{
              id: 'artboard-1',
              name: '匯入畫板',
              semanticModel: model,
              views: { diagram, mindmap },
              mindMapStructure: 'original',
            }]
        const importedBoard = importedBoards.find((artboard) => artboard.id === fileData.activeArtboardId) ?? importedBoards[0]
        setArtboardCollection(importedBoards)
        setActiveArtboardId(importedBoard.id)
        semanticModelRef.current = importedBoard.semanticModel
        setSemanticModel(importedBoard.semanticModel)
        diagramWorkspace.current = importedBoard.views.diagram
        mindMapWorkspace.current = importedBoard.views.mindmap
        setMindMapStructure(importedBoard.mindMapStructure)
        const active = workspaceMode === 'diagram' ? importedBoard.views.diagram : importedBoard.views.mindmap
        setNodes(active.nodes)
        setEdges(active.edges)
        markChanged('已匯入統一模型，兩種視圖已同步')
        setTimeout(() => flow.fitView({ padding: 0.08, duration: 500 }), 0)
      } catch {
        setNotice('JSON 格式不正確')
      }
    }
    reader.readAsText(file)
  }

  const exportPng = async () => {
    const viewport = document.querySelector<HTMLElement>('.react-flow__viewport')
    if (!viewport) return
    setNotice('正在生成圖片…')
    try {
      const dataUrl = await toPng(viewport, {
        backgroundColor: '#f7f4eb',
        pixelRatio: 2,
        filter: (node) => !node.classList?.contains('react-flow__resize-control') && !node.classList?.contains('diagram-handle'),
      })
      const anchor = document.createElement('a')
      anchor.href = dataUrl
      anchor.download = workspaceMode === 'mindmap' ? '心境思維導圖.png' : '心境圖譜.png'
      anchor.click()
      setNotice('已匯出 PNG 圖片')
    } catch {
      setNotice('圖片匯出失敗，請重試')
    }
  }

  const layerItems = useMemo(() => {
    const items = [...nodes]
        .filter((node) => node.id !== 'paper')
        .sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0))
        .map((node) => ({
          id: node.id,
          label: node.data.groupName || node.data.label || node.data.upper || (node.type === 'imageNode' ? '圖像' : node.type === 'frameNode' ? '分組框' : '圖形'),
          kind: node.type,
          isGroup: node.data.variant === 'group',
          parentId: node.parentId,
          depth: workspaceMode === 'mindmap'
            ? (() => {
                let depth = 0
                let cursor = node.id
                const visited = new Set<string>()
                while (!visited.has(cursor)) {
                  visited.add(cursor)
                  const incoming = edges.find((edge) => edge.data?.kind === 'hierarchy' && edge.target === cursor)
                  if (!incoming) break
                  depth += 1
                  cursor = incoming.source
                }
                return depth
              })()
            : node.parentId ? 1 : 0,
        }))
    const childIds = new Set(items.flatMap((item) => item.parentId ? [item.id] : []))
    return items
      .filter((item) => !childIds.has(item.id))
      .flatMap((item) => item.isGroup
        ? [item, ...items.filter((child) => child.parentId === item.id).map((child) => ({ ...child, depth: Math.max(1, child.depth) }))]
        : [item])
  }, [edges, nodes, workspaceMode])

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-seal">照</div>
          <div>
            <h1>心境圖譜</h1>
            <p>{workspaceMode === 'mindmap' ? '思維導圖 · 層級創作' : '可編輯概念圖 · 復刻稿'}</p>
          </div>
        </div>

        <div className="toolbar-group history-tools">
          <div className="workspace-switch" aria-label="工作區切換">
            <button className={workspaceMode === 'diagram' ? 'is-active' : ''} onClick={() => switchWorkspace('diagram')}><LayoutTemplate />圖譜</button>
            <button className={workspaceMode === 'mindmap' ? 'is-active' : ''} onClick={() => switchWorkspace('mindmap')}><Network />腦圖</button>
          </div>
          <div className="mobile-panel-tools" aria-label="編輯面板切換">
            <button
              className={showLayers ? 'is-active' : ''}
              aria-pressed={showLayers}
              onClick={() => {
                setShowLayers(true)
                setShowInspector(false)
              }}
            ><Frame />工具</button>
            <button
              className={showInspector ? 'is-active' : ''}
              aria-pressed={showInspector}
              onClick={() => {
                setShowLayers(false)
                setShowInspector(true)
              }}
            ><Palette />屬性</button>
          </div>
          <span className="toolbar-separator" />
          <IconButton label="復原" onClick={undo} disabled={!workspaceHistory().undo.length}><Undo2 /></IconButton>
          <IconButton label="重做" onClick={redo} disabled={!workspaceHistory().redo.length}><Redo2 /></IconButton>
          <span className="toolbar-separator" />
          <IconButton label="縮放至全圖" onClick={() => flow.fitView({ padding: 0.08, duration: 450 })}><Maximize2 /></IconButton>
          {workspaceMode === 'diagram' ? (
            <button className={`reference-toggle ${showReference ? 'is-active' : ''}`} onClick={toggleReference}>
              <FileImage /> 原圖底稿
            </button>
          ) : (
            <>
              <button className="mind-action" onClick={() => addMindTopic('child')}><Plus />子主題 <kbd>Tab</kbd></button>
              <button className="mind-action" onClick={() => addMindTopic('sibling')}><GitBranch />同級 <kbd>Enter</kbd></button>
              <button className="mind-action" onClick={() => arrangeMindMap()}><LayoutTemplate />原圖整理</button>
            </>
          )}
        </div>

        <div className="toolbar-group save-tools">
          <span className={`save-state ${saved ? 'is-saved' : ''}`}><span />{saved ? '已儲存' : '有變更'}</span>
          <IconButton label="載入瀏覽器存檔" onClick={() => restoreLocal()}><Upload /></IconButton>
          <button className="primary-button" onClick={saveLocal}><Save /> 儲存</button>
          <div className="export-menu">
            <button className="export-button"><Download /> 匯出 <ChevronDown /></button>
            <div className="export-popover">
              <button onClick={exportJson}>可編輯 JSON</button>
              <button onClick={exportPng}>PNG 圖片</button>
            </div>
          </div>
        </div>
      </header>

      <section className={`workspace ${showLayers ? '' : 'layers-collapsed'} ${showInspector ? '' : 'inspector-collapsed'}`}>
        <aside className="layers-panel panel">
          <div className="panel-heading">
            <div><span className="eyebrow">ELEMENTS</span><h2>元素</h2></div>
            <button onClick={() => setShowLayers(false)} aria-label="收起元素面板">‹</button>
          </div>
          <div className="add-grid">
            {workspaceMode === 'diagram' ? (
              <>
                <button onClick={addTextNode}><TextCursorInput /><span>文字</span></button>
                <button onClick={addFrame}><Frame /><span>分組框</span></button>
                <button onClick={() => uploadRef.current?.click()}><ImagePlus /><span>圖片</span></button>
                <button onClick={() => setNotice('拖曳節點邊緣的小圓點，即可建立連線')}><Link2 /><span>連線</span></button>
              </>
            ) : (
              <>
                <button onClick={() => addMindTopic('child')}><Plus /><span>子主題</span><kbd>Tab</kbd></button>
                <button onClick={() => addMindTopic('sibling')}><GitBranch /><span>同級主題</span><kbd>Enter</kbd></button>
                <button onClick={addFloatingText}><TextCursorInput /><span>自由文字</span></button>
                <button onClick={addFrame}><Frame /><span>邊界框</span></button>
                <button onClick={() => uploadRef.current?.click()}><ImagePlus /><span>圖片</span></button>
                <button onClick={() => setNotice('選取節點後，拖曳邊緣的小圓點建立自訂關係線')}><Link2 /><span>關係線</span></button>
                <button onClick={() => arrangeMindMap('original')}><LayoutTemplate /><span>原圖結構</span></button>
                <button onClick={() => arrangeMindMap('balanced')}><Network /><span>左右腦圖</span></button>
              </>
            )}
          </div>
          <input ref={uploadRef} className="hidden-input" type="file" accept="image/*" onChange={(event) => event.target.files?.[0] && addImage(event.target.files[0])} />

          <div className="layer-title"><span>畫板與{workspaceMode === 'mindmap' ? '大綱' : '圖層'}</span><span>{artboards.length}</span></div>
          <div className="layer-actions" aria-label="圖層與編組操作">
            <button onClick={groupSelected} disabled={groupableNodes.length < 2} title="選取兩個以上元素後編組">
              <Group /><span>編組</span><kbd>⌘G</kbd>
            </button>
            <button onClick={ungroupSelected} disabled={!selectedGroupIds.size} title="取消目前編組">
              <Ungroup /><span>取消</span><kbd>⇧⌘G</kbd>
            </button>
          </div>
          <div className="layer-list">
            {artboards.map((artboard, boardIndex) => {
              const isActive = artboard.id === activeArtboardId
              const boardSnapshot = artboard.views[workspaceMode]
              const itemCount = isActive ? layerItems.length : boardSnapshot.nodes.filter((node) => node.id !== 'paper').length
              return (
                <section className={`artboard-layer-section ${isActive ? 'is-active' : ''}`} key={artboard.id}>
                  <div className="artboard-layer-heading">
                    <button className="artboard-layer-open" onClick={() => switchArtboard(artboard.id)} aria-expanded={isActive}>
                      <span className="artboard-index">{String(boardIndex + 1).padStart(2, '0')}</span>
                      <span className="artboard-layer-name">{artboard.name}</span>
                      <span className="artboard-layer-count">{itemCount}</span>
                      <ChevronDown />
                    </button>
                    <button
                      className={`artboard-delete-button ${pendingDeleteArtboardId === artboard.id ? 'is-confirming' : ''}`}
                      onClick={() => deleteArtboard(artboard.id)}
                      disabled={artboards.length <= 1}
                      aria-label={`${pendingDeleteArtboardId === artboard.id ? '確認刪除' : '刪除'} ${artboard.name}`}
                      title={artboards.length <= 1 ? '至少保留一個畫板' : `刪除 ${artboard.name}`}
                    ><Trash2 /></button>
                  </div>
                  {isActive && (
                    <div className="artboard-layer-items">
                      {layerItems.map((item, index) => (
                        <div
                          key={item.id}
                          className={`layer-row ${selectedNodeIds.includes(item.id) ? 'is-active' : ''} ${draggedLayerId === item.id ? 'is-dragging' : ''} ${layerDropTargetId === item.id ? 'is-drop-target' : ''}`}
                          style={{ paddingLeft: Math.min(item.depth, 3) * 14 }}
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = 'move'
                            event.dataTransfer.setData('text/plain', item.id)
                            setDraggedLayerId(item.id)
                          }}
                          onDragOver={(event) => {
                            event.preventDefault()
                            event.dataTransfer.dropEffect = 'move'
                            setLayerDropTargetId(item.id)
                          }}
                          onDrop={(event) => {
                            event.preventDefault()
                            const sourceId = event.dataTransfer.getData('text/plain') || draggedLayerId
                            if (sourceId) reorderLayer(sourceId, item.id)
                            setDraggedLayerId(null)
                            setLayerDropTargetId(null)
                          }}
                          onDragEnd={() => {
                            setDraggedLayerId(null)
                            setLayerDropTargetId(null)
                          }}
                        >
                          <span className="layer-drag" aria-hidden="true"><GripVertical /></span>
                          <button
                            className="layer-select"
                            onClick={(event) => {
                              const additive = event.shiftKey || event.metaKey || event.ctrlKey
                              const nextSelection = additive
                                ? selectedNodeIds.includes(item.id)
                                  ? selectedNodeIds.filter((id) => id !== item.id)
                                  : [...selectedNodeIds, item.id]
                                : [item.id]
                              setSelectedNodeIds(nextSelection)
                              setNodes((current) => current.map((node) => ({ ...node, selected: nextSelection.includes(node.id) })))
                              if (!additive) flow.fitView({ nodes: [{ id: item.id }], padding: 1.5, duration: 350, maxZoom: 1.2 })
                            }}
                          >
                            <span className="layer-glyph">{item.isGroup ? '▣' : workspaceMode === 'mindmap' ? (item.depth === 0 ? '◉' : '—') : item.kind === 'imageNode' ? '◈' : item.kind === 'frameNode' ? '□' : '文'}</span>
                            <span>{item.label}</span>
                          </button>
                          <span className="layer-order-buttons">
                            <button onClick={() => moveLayer(item.id, -1)} disabled={index === 0} aria-label={`上移 ${item.label}`} title="上移一層"><ChevronUp /></button>
                            <button onClick={() => moveLayer(item.id, 1)} disabled={index === layerItems.length - 1} aria-label={`下移 ${item.label}`} title="下移一層"><ChevronDown /></button>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )
            })}
          </div>
          <div className="panel-footer-actions">
            <button onClick={() => importRef.current?.click()}><Upload /> 匯入 JSON</button>
            <button onClick={resetDiagram}><RotateCcw /> 重置</button>
            <input ref={importRef} className="hidden-input" type="file" accept="application/json" onChange={(event) => event.target.files?.[0] && importJson(event.target.files[0])} />
          </div>
        </aside>

        {!showLayers && <button className="panel-reveal reveal-left" onClick={() => setShowLayers(true)}>元素</button>}

        <div className="canvas-wrap">
          <nav className="artboard-strip" aria-label="畫板切換">
            <div className="artboard-tabs">
              {artboards.map((artboard, index) => (
                <div className={`artboard-tab-item ${artboard.id === activeArtboardId ? 'is-active' : ''}`} key={artboard.id}>
                  <button className="artboard-tab-open" onClick={() => switchArtboard(artboard.id)} title={`切換到 ${artboard.name}`}>
                    <span>{String(index + 1).padStart(2, '0')}</span>{artboard.name}
                  </button>
                  <button
                    className={`artboard-tab-delete ${pendingDeleteArtboardId === artboard.id ? 'is-confirming' : ''}`}
                    onClick={() => deleteArtboard(artboard.id)}
                    disabled={artboards.length <= 1}
                    aria-label={`${pendingDeleteArtboardId === artboard.id ? '確認刪除' : '刪除'} ${artboard.name}`}
                    title={artboards.length <= 1 ? '至少保留一個畫板' : `刪除 ${artboard.name}`}
                  ><Trash2 /></button>
                </div>
              ))}
            </div>
            <button className="add-artboard-button" onClick={addArtboard} aria-label="新增畫板" title="新增畫板"><Plus /></button>
            <button className="background-upload-button" onClick={() => backgroundUploadRef.current?.click()} aria-label="上傳底圖" title="為目前畫板上傳或替換底圖">
              <ImagePlus /><span>上傳底圖</span>
            </button>
            <input
              ref={backgroundUploadRef}
              className="hidden-input"
              type="file"
              accept="image/*"
              aria-label="上傳畫板底圖"
              onChange={(event) => event.target.files?.[0] && uploadArtboardBackground(event.target.files[0])}
            />
          </nav>
          <ReactFlow<DiagramNode, DiagramEdge>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={(changes) => {
              onNodesChange(changes)
              if (changes.some((change) => change.type !== 'select')) markChanged('正在自動儲存變更')
            }}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onSelectionChange={handleSelection}
            onNodeDragStart={remember}
            onNodeDragStop={() => markChanged('已移動元素')}
            onPaneClick={() => setNotice('提示：雙擊文字可直接編輯')}
            onKeyDown={(event) => {
              const target = event.target
              if (
                target instanceof HTMLElement &&
                (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
              ) return

              if (workspaceMode === 'mindmap' && event.key === 'Tab') {
                event.preventDefault()
                addMindTopic('child')
                return
              }
              if (workspaceMode === 'mindmap' && event.key === 'Enter') {
                event.preventDefault()
                addMindTopic('sibling')
                return
              }

              if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
                event.preventDefault()
                event.shiftKey ? redo() : undo()
                return
              }
              if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'g') {
                event.preventDefault()
                event.shiftKey ? ungroupSelected() : groupSelected()
                return
              }
              if ((event.key === 'Backspace' || event.key === 'Delete') && (selectedNodeIds.length || selectedEdgeIds.length)) {
                event.preventDefault()
                removeSelected()
              }
            }}
            fitView
            fitViewOptions={{ padding: workspaceMode === 'mindmap' ? 0.14 : 0.08 }}
            minZoom={0.25}
            maxZoom={2.5}
            nodeExtent={workspaceMode === 'mindmap' ? [[-450, -250], [2150, 1300]] : [[-180, -180], [1100, 1760]]}
            multiSelectionKeyCode={['Meta', 'Control']}
            selectionKeyCode="Shift"
            deleteKeyCode={null}
            snapToGrid
            snapGrid={[5, 5]}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#c7c4ba" />
            <Controls position="bottom-left" showInteractive={false} />
          </ReactFlow>
          <div className="canvas-status">
            <span className="status-mark"><Check /></span>
            <span>{notice}</span>
            <span className="status-divider" />
            <span>{workspaceMode === 'mindmap' ? 'Tab 子主題 · Enter 同級 · 雙擊編輯' : '雙擊文字編輯 · 拖曳圓點連線'}</span>
          </div>
        </div>

        {!showInspector && <button className="panel-reveal reveal-right" onClick={() => setShowInspector(true)}>屬性</button>}

        <aside className="inspector-panel panel">
          <div className="panel-heading">
            <div><span className="eyebrow">INSPECTOR</span><h2>屬性</h2></div>
            <button onClick={() => setShowInspector(false)} aria-label="收起屬性面板">›</button>
          </div>

          {workspaceMode === 'mindmap' && (
            <div className="mindmap-settings">
              <div className="setting-section-title"><Palette />主題</div>
              <div className="theme-swatches">
                <button className="theme-ink" onClick={() => applyMindTheme('ink')} aria-label="墨色主題"><span /><span /><span /></button>
                <button className="theme-jade" onClick={() => applyMindTheme('jade')} aria-label="松石主題"><span /><span /><span /></button>
                <button className="theme-indigo" onClick={() => applyMindTheme('indigo')} aria-label="靛青主題"><span /><span /><span /></button>
              </div>
              <div className="setting-section-title"><Network />結構</div>
              <div className="structure-buttons">
                <button className={mindMapStructure === 'original' ? 'is-active' : ''} onClick={() => arrangeMindMap('original')}><LayoutTemplate />原圖結構</button>
                <button className={mindMapStructure === 'balanced' ? 'is-active' : ''} onClick={() => arrangeMindMap('balanced')}><Network />左右平衡</button>
                <button className={mindMapStructure === 'right' ? 'is-active' : ''} onClick={() => arrangeMindMap('right')}><ListTree />向右邏輯</button>
              </div>
            </div>
          )}

          {!selectedNode && !selectedEdge && (
            <div className="empty-inspector">
              <Braces />
              <h3>選取一個元素</h3>
              <p>{workspaceMode === 'mindmap' ? '選取主題後可調整文字、樣式與分支。' : '可修改文字、字級、分組框與連線樣式。'}</p>
            </div>
          )}

          {selectedNode && (
            <div className="property-stack">
              <div className="selection-summary"><span>已選元素</span><strong>{selectedNode.data.label || selectedNode.data.upper || '圖形元素'}</strong></div>
              {selectedNode.type === 'textNode' && (
                <>
                  <label>主文字<textarea value={selectedNode.data.label ?? ''} onChange={(event) => updateNode({ label: event.target.value })} /></label>
                  <label>副文字<textarea value={selectedNode.data.secondary ?? ''} onChange={(event) => updateNode({ secondary: event.target.value })} placeholder="可留空" /></label>
                  <div className="property-row">
                    <label>字級<input type="number" min="12" max="72" value={selectedNode.data.fontSize ?? 24} onChange={(event) => updateNode({ fontSize: Number(event.target.value) })} /></label>
                    <label>字重<select value={selectedNode.data.weight ?? 400} onChange={(event) => updateNode({ weight: Number(event.target.value) })}><option value="400">常規</option><option value="500">中等</option><option value="600">粗體</option></select></label>
                  </div>
                  <label>對齊<select value={selectedNode.data.align ?? 'center'} onChange={(event) => updateNode({ align: event.target.value as 'left' | 'center' | 'right' })}><option value="left">靠左</option><option value="center">置中</option><option value="right">靠右</option></select></label>
                  {selectedNode.data.variant === 'topic' && (
                    <>
                      <label>備註<textarea value={selectedNode.data.note ?? ''} onChange={(event) => updateNode({ note: event.target.value })} placeholder="為此主題補充說明" /></label>
                      <button className={`branch-toggle ${selectedNode.data.collapsed ? 'is-collapsed' : ''}`} onClick={toggleBranch}>
                        <GitBranch />{selectedNode.data.collapsed ? '展開下級分支' : '收起下級分支'}
                      </button>
                      <div className="topic-shortcuts"><span><kbd>Tab</kbd> 子主題</span><span><kbd>Enter</kbd> 同級主題</span></div>
                    </>
                  )}
                </>
              )}
              {selectedNode.type === 'frameNode' && (
                <>
                  <label className="toggle-row"><span><strong>虛線邊框</strong><small>用於下方關係分組</small></span><input type="checkbox" checked={Boolean(selectedNode.data.dashed)} onChange={(event) => updateNode({ dashed: event.target.checked })} /></label>
                  <label className="toggle-row"><span><strong>圓角</strong><small>保留原圖柔和框線</small></span><input type="checkbox" checked={Boolean(selectedNode.data.rounded)} onChange={(event) => updateNode({ rounded: event.target.checked })} /></label>
                </>
              )}
              {selectedNode.type === 'imageNode' && <p className="property-note">拖動四角可等比例縮放此線稿素材。</p>}
              {selectedNode.data.semanticId !== semanticModelRef.current.rootId && <button className="danger-button" onClick={removeSelected}><Trash2 /> 刪除元素</button>}
            </div>
          )}

          {selectedEdge && (
            <div className="property-stack">
              <div className="selection-summary"><span>已選連線</span><strong>節點關係</strong></div>
              <label className="toggle-row"><span><strong>虛線</strong><small>呈現相互映照關係</small></span><input type="checkbox" checked={Boolean(selectedEdge.data?.dashed)} onChange={(event) => updateEdge({ dashed: event.target.checked })} /></label>
              <label className="toggle-row"><span><strong>雙向箭頭</strong><small>兩端皆顯示箭頭</small></span><input type="checkbox" checked={Boolean(selectedEdge.data?.bidirectional)} onChange={(event) => updateEdge({ bidirectional: event.target.checked })} /></label>
              <button className="danger-button" onClick={removeSelected}><Trash2 /> 刪除連線</button>
            </div>
          )}
        </aside>
      </section>
    </main>
  )
}

export default function App() {
  return (
    <ReactFlowProvider>
      <Editor />
    </ReactFlowProvider>
  )
}
