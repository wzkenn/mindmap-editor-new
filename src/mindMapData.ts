import { MarkerType } from '@xyflow/react'
import type { DiagramEdge, DiagramNode } from './types'

type TopicOptions = {
  level: number
  direction?: 'left' | 'right'
  color?: string
  fill?: string
}

export const topicNode = (
  id: string,
  label: string,
  x: number,
  y: number,
  width: number,
  options: TopicOptions,
): DiagramNode => ({
  id,
  type: 'textNode',
  position: { x, y },
  style: { width },
  zIndex: 5,
  data: {
    label,
    variant: 'topic',
    topicLevel: options.level,
    direction: options.direction,
    branchColor: options.color ?? '#a9472e',
    fill: options.fill,
    fontSize: options.level === 0 ? 26 : options.level === 1 ? 18 : 15,
    weight: options.level === 0 ? 600 : options.level === 1 ? 600 : 500,
    align: 'center',
    collapsed: false,
    semanticId: id,
  },
})

export const hierarchyEdge = (
  id: string,
  source: string,
  target: string,
  color: string,
  direction: 'left' | 'right' = 'right',
): DiagramEdge => ({
  id,
  source,
  target,
  sourceHandle: `${direction}-source`,
  targetHandle: `${direction === 'right' ? 'left' : 'right'}-target`,
  type: 'mindMapEdge',
  zIndex: 2,
  markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10, color },
  data: { kind: 'hierarchy', branchColor: color },
})
