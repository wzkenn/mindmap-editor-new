import { useEffect, useRef, useState } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getStraightPath,
  Handle,
  NodeResizer,
  Position,
  useReactFlow,
  type EdgeProps,
  type NodeProps,
} from '@xyflow/react'
import type { DiagramEdge, DiagramNode, DiagramNodeData } from './types'
import { assetUrl } from './assetUrl'

const HANDLE_LIST = [
  ['top', Position.Top],
  ['right', Position.Right],
  ['bottom', Position.Bottom],
  ['left', Position.Left],
] as const

function Handles({ selected }: { selected?: boolean }) {
  return (
    <>
      {HANDLE_LIST.map(([id, position]) => (
        <span key={id}>
          <Handle
            id={`${id}-target`}
            type="target"
            position={position}
            className={selected ? 'diagram-handle is-visible' : 'diagram-handle'}
          />
          <Handle
            id={`${id}-source`}
            type="source"
            position={position}
            className={selected ? 'diagram-handle is-visible' : 'diagram-handle'}
          />
        </span>
      ))}
    </>
  )
}

export function ArtboardNode({ data }: NodeProps<DiagramNode>) {
  const referenceSrc = data.backgroundSrc || (data.showReference ? assetUrl('assets/reference-original.jpg') : undefined)
  return (
    <div className="artboard-node">
      {referenceSrc && (
        <img
          className="reference-image"
          src={referenceSrc}
          alt={data.backgroundSrc ? '畫板底圖' : '原圖參考底稿'}
          style={{ opacity: data.backgroundSrc ? data.backgroundOpacity ?? 0.34 : data.referenceOpacity ?? 0.16 }}
        />
      )}
      <div className="paper-grain" />
    </div>
  )
}

export function TextNode({ id, data, selected }: NodeProps<DiagramNode>) {
  const { updateNodeData } = useReactFlow<DiagramNode, DiagramEdge>()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(data.label ?? '')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => setValue(data.label ?? ''), [data.label])
  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const commit = () => {
    window.dispatchEvent(new CustomEvent('diagram-change', { detail: '已編輯文字' }))
    updateNodeData(id, { label: value })
    window.dispatchEvent(new CustomEvent('semantic-node-change', { detail: { nodeId: id, field: 'label', value } }))
    setEditing(false)
  }

  const isTopic = data.variant === 'topic'
  const topicStyle = isTopic
    ? {
        background: data.fill ?? (data.topicLevel === 0 ? '#22231f' : '#fbfaf6'),
        borderColor: data.borderColor ?? data.branchColor ?? '#a9472e',
        color: data.textColor ?? (data.topicLevel === 0 ? '#fffdf5' : '#22231f'),
      }
    : undefined

  return (
    <div
      className={`text-node ${isTopic ? `topic-node topic-level-${data.topicLevel ?? 2}` : ''} ${selected ? 'is-selected' : ''}`}
      style={topicStyle}
      onDoubleClick={() => setEditing(true)}
    >
      <NodeResizer isVisible={selected} minWidth={70} minHeight={32} lineClassName="resize-line" handleClassName="resize-handle" />
      {editing ? (
        <textarea
          ref={inputRef}
          className="node-textarea nodrag"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              commit()
            }
            if (event.key === 'Escape') {
              setValue(data.label ?? '')
              setEditing(false)
            }
          }}
          style={{ fontSize: data.fontSize ?? 24, fontWeight: data.weight ?? 400, textAlign: data.align ?? 'center' }}
        />
      ) : (
        <div
          className="node-copy"
          style={{
            fontSize: data.fontSize ?? 24,
            fontWeight: data.weight ?? 400,
            textAlign: data.align ?? 'center',
            writingMode: data.vertical ? 'vertical-rl' : 'horizontal-tb',
            color: isTopic ? topicStyle?.color : undefined,
          }}
        >
          <div>{data.label}</div>
          {data.secondary && <div className="secondary-copy">{data.secondary}</div>}
        </div>
      )}
      {isTopic && data.collapsed && <span className="topic-collapse-indicator" title="分支已收起">+</span>}
      <Handles selected={selected} />
    </div>
  )
}

export function StackNode({ id, data, selected }: NodeProps<DiagramNode>) {
  const { updateNodeData } = useReactFlow<DiagramNode, DiagramEdge>()
  const [active, setActive] = useState<'upper' | 'lower' | null>(null)
  const [value, setValue] = useState('')

  const start = (part: 'upper' | 'lower') => {
    setActive(part)
    setValue(data[part] ?? '')
  }
  const commit = () => {
    if (active) {
      window.dispatchEvent(new CustomEvent('diagram-change', { detail: '已編輯文字' }))
      updateNodeData(id, { [active]: value })
      window.dispatchEvent(new CustomEvent('semantic-node-change', { detail: { nodeId: id, field: active, value } }))
    }
    setActive(null)
  }

  return (
    <div className={`stack-node ${selected ? 'is-selected' : ''}`}>
      <NodeResizer isVisible={selected} minWidth={70} minHeight={120} lineClassName="resize-line" handleClassName="resize-handle" />
      {(['upper', 'lower'] as const).map((part) => (
        <div className="stack-cell" key={part} onDoubleClick={() => start(part)}>
          {active === part ? (
            <input
              autoFocus
              className="stack-input nodrag"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onBlur={commit}
              onKeyDown={(event) => {
                event.stopPropagation()
                if (event.key === 'Enter') commit()
              }}
            />
          ) : (
            <span style={{ fontSize: data.fontSize ?? 38 }}>{data[part]}</span>
          )}
        </div>
      ))}
      <Handles selected={selected} />
    </div>
  )
}

export function ImageNode({ data, selected }: NodeProps<DiagramNode>) {
  return (
    <div className={`image-node ${selected ? 'is-selected' : ''}`}>
      <NodeResizer isVisible={selected} minWidth={50} minHeight={80} keepAspectRatio lineClassName="resize-line" handleClassName="resize-handle" />
      <img src={data.src ? assetUrl(data.src) : undefined} alt={data.label ?? '圖像元素'} draggable={false} />
      <Handles selected={selected} />
    </div>
  )
}

export function FrameNode({ data, selected }: NodeProps<DiagramNode>) {
  return (
    <div
      className={`frame-node ${data.variant === 'group' ? 'is-group' : ''} ${data.dashed ? 'is-dashed' : ''} ${data.rounded ? 'is-rounded' : ''} ${selected ? 'is-selected' : ''}`}
    >
      <NodeResizer isVisible={selected} minWidth={120} minHeight={100} lineClassName="resize-line" handleClassName="resize-handle" />
      {data.variant === 'group' && <span className="group-label">{data.groupName ?? '編組'}</span>}
      <Handles selected={selected} />
    </div>
  )
}

export function SymbolNode({ data, selected }: NodeProps<DiagramNode>) {
  if (data.variant === 'bracket') {
    return (
      <div className={`symbol-node ${selected ? 'is-selected' : ''}`}>
        <svg viewBox="0 0 92 132" preserveAspectRatio="none" aria-label="方括號">
          <path d="M 4 66 H 35 M 35 6 H 88 M 35 6 V 126 M 35 126 H 88" />
        </svg>
      </div>
    )
  }
  return (
    <div className={`symbol-node ${selected ? 'is-selected' : ''}`}>
      <svg viewBox="0 0 350 42" preserveAspectRatio="none" aria-label="下方大括號">
        <path d="M 2 4 C 2 25 18 26 36 26 H 157 C 169 26 175 35 175 40 C 175 35 181 26 193 26 H 314 C 332 26 348 25 348 4" />
      </svg>
    </div>
  )
}

export function DiagramEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerEnd,
  markerStart,
  data,
  selected,
}: EdgeProps<DiagramEdge>) {
  const [path, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY })
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        markerStart={markerStart}
        style={{
          stroke: selected ? '#a9472e' : '#191a18',
          strokeWidth: selected ? 2.2 : 1.8,
          strokeDasharray: data?.dashed ? '7 6' : undefined,
        }}
      />
      {selected && (
        <EdgeLabelRenderer>
          <div className="edge-label nodrag nopan" style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)` }}>
            連線
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

export function MindMapEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  markerStart,
  data,
  selected,
}: EdgeProps<DiagramEdge>) {
  const [path] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, curvature: 0.45 })
  const color = selected ? '#20211e' : data?.branchColor ?? '#a9472e'
  return (
    <BaseEdge
      id={id}
      path={path}
      markerEnd={markerEnd}
      markerStart={markerStart}
      style={{
        stroke: color,
        strokeWidth: selected ? 3 : data?.semanticKind === 'membership' ? 1.5 : 2.2,
        strokeDasharray: data?.dashed ? '7 6' : undefined,
      }}
    />
  )
}

export const nodeTypes = {
  artboardNode: ArtboardNode,
  textNode: TextNode,
  stackNode: StackNode,
  imageNode: ImageNode,
  frameNode: FrameNode,
  symbolNode: SymbolNode,
}

export const edgeTypes = {
  diagramEdge: DiagramEdgeComponent,
  mindMapEdge: MindMapEdgeComponent,
}

export const editableDataKeys: Array<keyof DiagramNodeData> = ['label', 'secondary', 'fontSize', 'weight', 'align', 'vertical']
