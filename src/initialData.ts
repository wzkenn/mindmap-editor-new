import { MarkerType, Position } from '@xyflow/react'
import type { DiagramEdge, DiagramNode } from './types'
import { assetUrl } from './assetUrl'

const text = (
  id: string,
  label: string,
  x: number,
  y: number,
  width: number,
  fontSize = 28,
  weight = 400,
  secondary?: string,
): DiagramNode => ({
  id,
  type: 'textNode',
  position: { x, y },
  style: { width },
  zIndex: 5,
  data: { label, secondary, fontSize, weight, align: 'center', variant: 'text', semanticId: id },
})

const image = (id: string, src: string, x: number, y: number, width: number, height: number): DiagramNode => ({
  id,
  type: 'imageNode',
  position: { x, y },
  style: { width, height },
  zIndex: 4,
  data: { src, label: id.startsWith('lamp') ? '能照／燈' : '所照／鏡', variant: 'image' },
})

const frame = (
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  dashed = false,
  rounded = true,
): DiagramNode => ({
  id,
  type: 'frameNode',
  position: { x, y },
  style: { width, height },
  zIndex: 1,
  data: { variant: 'frame', dashed, rounded },
})

const edge = (
  id: string,
  source: string,
  target: string,
  sourceHandle: string,
  targetHandle: string,
  dashed = false,
  bidirectional = false,
): DiagramEdge => ({
  id,
  source,
  target,
  sourceHandle: `${sourceHandle}-source`,
  targetHandle: `${targetHandle}-target`,
  type: 'diagramEdge',
  zIndex: 3,
  markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: '#191a18' },
  markerStart: bidirectional
    ? { type: MarkerType.ArrowClosed, width: 16, height: 16, color: '#191a18' }
    : undefined,
  data: { dashed, bidirectional },
})

export const initialNodes: DiagramNode[] = [
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
    type: 'stackNode',
    position: { x: 205, y: 42 },
    style: { width: 105, height: 205 },
    zIndex: 5,
    data: { upper: '心', lower: '境', fontSize: 38, variant: 'stack', semanticId: 'mind-context' },
  },
  {
    id: 'top-bracket',
    type: 'symbolNode',
    position: { x: 315, y: 76 },
    style: { width: 92, height: 132 },
    zIndex: 3,
    data: { variant: 'bracket' },
  },
  text('body', '體', 400, 66, 80, 29),
  text('function', '用（本智）', 400, 168, 170, 27),
  text('matter', '事', 222, 278, 100, 36, 500, '（所照／鏡）'),
  text('principle', '理', 487, 278, 100, 36, 500, '（能照／燈）'),
  {
    id: 'top-brace',
    type: 'symbolNode',
    position: { x: 245, y: 390 },
    style: { width: 350, height: 42 },
    zIndex: 3,
    data: { variant: 'brace' },
  },

  frame('principle-frame', 118, 432, 682, 440),
  text('principle-title', '理事無礙法界', 270, 452, 380, 36, 600, '（一燈雙入，心境互照，智照斯在）'),
  image('mirror-left', assetUrl('assets/mirror.png'), 158, 548, 142, 224),
  image('lamp-center', assetUrl('assets/lamp.png'), 374, 548, 164, 224),
  image('mirror-right', assetUrl('assets/mirror.png'), 620, 548, 142, 224),
  text('mirror-left-label', '心／事', 146, 780, 165, 25, 500, '（所照／鏡）'),
  text('lamp-label', '本智／理／用', 350, 780, 210, 25, 500, '（能照／燈）'),
  text('mirror-right-label', '境／事', 608, 780, 165, 25, 500, '（所照／鏡）'),

  text('all-title', '事事無礙法界', 278, 916, 365, 36, 600, '（心心互研，境境相望）'),
  text('heart-heading', '心心互研', 105, 1009, 230, 24, 500),
  text('context-heading', '境境相望', 590, 1009, 230, 24, 500),
  frame('heart-frame', 35, 1055, 390, 295, true, true),
  frame('context-frame', 495, 1055, 390, 295, true, true),

  image('heart-top', assetUrl('assets/mirror.png'), 171, 1065, 118, 186),
  image('heart-left', assetUrl('assets/mirror.png'), 55, 1144, 112, 176),
  image('heart-right', assetUrl('assets/mirror.png'), 292, 1144, 112, 176),
  image('heart-bottom', assetUrl('assets/mirror.png'), 171, 1190, 118, 186),
  image('context-top', assetUrl('assets/mirror.png'), 631, 1065, 118, 186),
  image('context-left', assetUrl('assets/mirror.png'), 515, 1144, 112, 176),
  image('context-right', assetUrl('assets/mirror.png'), 752, 1144, 112, 176),
  image('context-bottom', assetUrl('assets/mirror.png'), 631, 1190, 118, 186),
]

export const initialEdges: DiagramEdge[] = [
  edge('e-context-matter', 'mind-context', 'matter', 'bottom', 'top'),
  edge('e-function-principle', 'function', 'principle', 'bottom', 'top'),
  edge('e-frame-all', 'principle-frame', 'all-title', 'bottom', 'top'),
  edge('e-left-lamp', 'mirror-left', 'lamp-center', 'right', 'left', true, true),
  edge('e-lamp-right', 'lamp-center', 'mirror-right', 'right', 'left', true, true),

  edge('eh-lr', 'heart-left', 'heart-right', 'right', 'left', true, true),
  edge('eh-tl', 'heart-top', 'heart-left', 'left', 'top', true, true),
  edge('eh-tr', 'heart-top', 'heart-right', 'right', 'top', true, true),
  edge('eh-bl', 'heart-bottom', 'heart-left', 'left', 'bottom', true, true),
  edge('eh-br', 'heart-bottom', 'heart-right', 'right', 'bottom', true, true),
  edge('eh-tb', 'heart-top', 'heart-bottom', 'bottom', 'top', true, true),

  edge('ec-lr', 'context-left', 'context-right', 'right', 'left', true, true),
  edge('ec-tl', 'context-top', 'context-left', 'left', 'top', true, true),
  edge('ec-tr', 'context-top', 'context-right', 'right', 'top', true, true),
  edge('ec-bl', 'context-bottom', 'context-left', 'left', 'bottom', true, true),
  edge('ec-br', 'context-bottom', 'context-right', 'right', 'bottom', true, true),
  edge('ec-tb', 'context-top', 'context-bottom', 'bottom', 'top', true, true),
]

export const handlePositions = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
}
