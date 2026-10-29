// サンプル図面。製図ツール（seizu-tool）の図面データ形式（format: seizu-tool, version: 1）で作る。
// 座標は実寸mm（左下原点）。ここでは用紙上のmmで書き、縮尺で実寸に直す。

type Ent = Record<string, unknown>

interface Spec {
  drawingNo: string
  name: string
  material: string
  author: string
  date: string
  paper?: 'A4' | 'A3'
  orientation?: 'landscape' | 'portrait'
  scale: number // 10 → 1:10
  build: (d: Pen) => void
}

class Pen {
  entities: Ent[] = []
  private s: number
  constructor(scale: number) {
    this.s = scale
  }
  private r = (v: number) => Math.round(v * this.s * 1000) / 1000
  private add(e: Ent) {
    this.entities.push({ id: this.entities.length + 1, ...e })
  }
  line(x1: number, y1: number, x2: number, y2: number, kind: 'outline' | 'hidden' | 'center' | 'thin' = 'outline') {
    const map = {
      outline: { layer: 'outline', lineType: 'solid' },
      hidden: { layer: 'hidden', lineType: 'dashed' },
      center: { layer: 'center', lineType: 'chain' },
      thin: { layer: 'outline', lineType: 'thin' },
    }
    this.add({ type: 'line', ...map[kind], x1: this.r(x1), y1: this.r(y1), x2: this.r(x2), y2: this.r(y2) })
  }
  rect(x: number, y: number, w: number, h: number, kind: 'outline' | 'hidden' = 'outline') {
    this.add({
      type: 'rect', layer: kind, lineType: kind === 'hidden' ? 'dashed' : 'solid',
      x: this.r(x), y: this.r(y), width: this.r(w), height: this.r(h), rotation: 0,
    })
  }
  circle(cx: number, cy: number, r: number, cross = false) {
    this.add({ type: 'circle', layer: 'outline', lineType: 'solid', cx: this.r(cx), cy: this.r(cy), r: this.r(r) })
    if (cross) {
      const e = r + 2
      this.line(cx - e, cy, cx + e, cy, 'center')
      this.line(cx, cy - e, cx, cy + e, 'center')
    }
  }
  dimH(x1: number, x2: number, y: number, at: number) {
    this.add({
      type: 'dim', dimType: 'linear', layer: 'dim', lineType: 'thin', orient: 'h',
      p1: [this.r(x1), this.r(y)], p2: [this.r(x2), this.r(y)], offset: this.r(at),
    })
  }
  dimV(y1: number, y2: number, x: number, at: number) {
    this.add({
      type: 'dim', dimType: 'linear', layer: 'dim', lineType: 'thin', orient: 'v',
      p1: [this.r(x), this.r(y1)], p2: [this.r(x), this.r(y2)], offset: this.r(at),
    })
  }
  dia(cx: number, cy: number, r: number, angleDeg = 45) {
    this.add({ type: 'dim', dimType: 'dia', layer: 'dim', lineType: 'thin', cx: this.r(cx), cy: this.r(cy), r: this.r(r), angleDeg })
  }
  text(x: number, y: number, content: string, height = 3.5) {
    this.add({ type: 'text', layer: 'note', lineType: 'thin', x: this.r(x), y: this.r(y), height, content, rotation: 0 })
  }
  bom(x: number, y: number, rows: { no: string; name: string; qty: string; material: string }[]) {
    this.add({ type: 'bom', layer: 'note', lineType: 'thin', x: this.r(x), y: this.r(y), rows })
  }
}

function makeDoc(spec: Spec): string {
  const pen = new Pen(spec.scale)
  spec.build(pen)
  const doc = {
    format: 'seizu-tool',
    version: 1,
    paper: { size: spec.paper ?? 'A4', orientation: spec.orientation ?? 'landscape' },
    scale: { ratio: [1, spec.scale] },
    userOrigin: { x: 10, y: 10 },
    grid: { mode: 'auto', manualMm: 1 },
    mirror45: null,
    titleBlock: {
      fields: [
        { label: '図番', value: spec.drawingNo },
        { label: '図名', value: spec.name },
        { label: '尺度', bind: 'scale' },
        { label: '用紙', bind: 'paper' },
        { label: '材質', value: spec.material },
        { label: '作成者', value: spec.author },
        { label: '日付', value: spec.date },
      ],
    },
    layers: [
      { id: 'outline', name: '外形線', visible: true, printable: true },
      { id: 'hidden', name: 'かくれ線', visible: true, printable: true },
      { id: 'center', name: '中心線', visible: true, printable: true },
      { id: 'dim', name: '寸法', visible: true, printable: true },
      { id: 'note', name: '注記', visible: true, printable: true },
      { id: 'aux', name: '補助線', visible: true, printable: false },
    ],
    nextId: pen.entities.length + 1,
    entities: pen.entities,
  }
  return JSON.stringify(doc, null, 2)
}

/** Aライン 部品置き台（1:10）。正面図・側面図・部品表 */
export const stand = (date: string, author: string) =>
  makeDoc({
    drawingNo: 'DW-STAND-01', name: '部品置き台', material: 'STKR400', author, date, scale: 10,
    build: (p) => {
      // 正面図 幅900×高さ800（用紙上 90×80）
      const x0 = 30, y0 = 85
      p.rect(x0, y0 + 77, 90, 3) // 天板
      p.rect(x0, y0 + 6, 4, 71) // 脚
      p.rect(x0 + 86, y0 + 6, 4, 71)
      p.rect(x0 + 4, y0 + 40, 82, 3) // 中段
      p.line(x0 + 4, y0 + 12, x0 + 86, y0 + 12) // 下桟
      p.line(x0 + 4, y0 + 16, x0 + 86, y0 + 16)
      p.circle(x0 + 2, y0 + 3, 3) // キャスター
      p.circle(x0 + 88, y0 + 3, 3)
      p.line(x0 + 45, y0 - 4, x0 + 45, y0 + 84, 'center')
      p.dimH(x0, x0 + 90, y0 + 80, y0 + 92)
      p.dimV(y0, y0 + 80, x0, x0 - 10)
      p.text(x0 + 30, y0 - 12, '正面図')
      // 側面図 奥行600（用紙上 60）
      const sx = 150
      p.rect(sx, y0 + 77, 60, 3)
      p.rect(sx, y0 + 6, 4, 71)
      p.rect(sx + 56, y0 + 6, 4, 71)
      p.rect(sx + 4, y0 + 40, 52, 3)
      p.rect(sx + 4, y0 + 52, 52, 22, 'hidden') // 部品箱の想定位置
      p.circle(sx + 2, y0 + 3, 3)
      p.circle(sx + 58, y0 + 3, 3)
      p.dimH(sx, sx + 60, y0 + 80, y0 + 92)
      p.text(sx + 18, y0 - 12, '側面図')
      p.bom(28, 18, [
        { no: '1', name: '角パイプ □40×40', qty: '8', material: 'STKR400' },
        { no: '2', name: '天板・中段板 t3.2', qty: '2', material: 'SS400' },
        { no: '3', name: 'キャスター φ75', qty: '4', material: '市販品' },
      ])
    },
  })

/** 取付板（1:1）。4隅の穴と中央穴 */
export const plate = (date: string, author: string) =>
  makeDoc({
    drawingNo: 'DW-PLATE-01', name: '取付板', material: 'SS400', author, date, scale: 1,
    build: (p) => {
      const x0 = 40, y0 = 95, w = 120, h = 80
      p.rect(x0, y0, w, h)
      for (const [cx, cy] of [[x0 + 12, y0 + 12], [x0 + w - 12, y0 + 12], [x0 + 12, y0 + h - 12], [x0 + w - 12, y0 + h - 12]])
        p.circle(cx, cy, 4.5, true)
      p.circle(x0 + w / 2, y0 + h / 2, 15, true)
      p.dia(x0 + w / 2, y0 + h / 2, 15, 35)
      p.dia(x0 + w - 12, y0 + h - 12, 4.5, 40)
      p.dimH(x0, x0 + w, y0 + h, y0 + h + 12)
      p.dimV(y0, y0 + h, x0, x0 - 12)
      p.dimH(x0 + 12, x0 + w - 12, y0, y0 - 10)
      // 側面（板厚9）
      p.rect(x0 + w + 25, y0, 9, h)
      p.dimH(x0 + w + 25, x0 + w + 34, y0 + h, y0 + h + 12)
      p.text(x0, y0 - 24, '4-φ9 キリ　表面処理：三価クロメート', 3)
      p.bom(28, 18, [
        { no: '1', name: '取付板', qty: '2', material: 'SS400' },
        { no: '2', name: 'ボルト M6', qty: '4', material: 'SCM435' },
      ])
    },
  })

/** 検査治具（1:2）。ベース板・位置決めピン・クランプ */
export const jig = (date: string, author: string) =>
  makeDoc({
    drawingNo: 'DW-JIG-07', name: '検査治具', material: 'A5052', author, date, scale: 2,
    build: (p) => {
      const x0 = 35, y0 = 90, w = 110, h = 70
      p.rect(x0, y0, w, h)
      p.rect(x0 + 25, y0 + 18, 60, 34, 'hidden') // ワーク外形
      p.circle(x0 + 20, y0 + 35, 4, true) // 位置決めピン
      p.circle(x0 + 90, y0 + 35, 4, true)
      p.rect(x0 + 45, y0 + 56, 20, 10) // クランプ
      p.rect(x0 + 45, y0 + 4, 20, 10)
      for (const [cx, cy] of [[x0 + 8, y0 + 8], [x0 + w - 8, y0 + 8], [x0 + 8, y0 + h - 8], [x0 + w - 8, y0 + h - 8]]) p.circle(cx, cy, 3)
      p.dimH(x0, x0 + w, y0 + h, y0 + h + 12)
      p.dimV(y0, y0 + h, x0, x0 - 12)
      p.dimH(x0 + 20, x0 + 90, y0 + 35, y0 - 10)
      p.dia(x0 + 90, y0 + 35, 4, 30)
      p.text(x0, y0 - 24, 'ピン：SKS3 焼入れ HRC58〜62', 3)
      p.bom(28, 18, [
        { no: '1', name: 'ベース板 t15', qty: '1', material: 'A5052' },
        { no: '2', name: '位置決めピン φ8', qty: '2', material: 'SKS3' },
        { no: '3', name: 'トグルクランプ', qty: '2', material: '市販品' },
      ])
    },
  })

/** 安全カバー（1:5）。枠とパネル */
export const cover = (date: string, author: string) =>
  makeDoc({
    drawingNo: 'DW-COVER-03', name: '安全カバー', material: 'PC t5 / A6063', author, date, scale: 5,
    build: (p) => {
      const x0 = 30, y0 = 80, w = 120, h = 80
      p.rect(x0, y0, w, h)
      p.rect(x0 + 4, y0 + 4, w - 8, h - 8)
      p.line(x0 + w / 2, y0 + 4, x0 + w / 2, y0 + h - 4)
      p.rect(x0 + w / 2 - 14, y0 + h / 2 - 3, 8, 6) // 取っ手
      p.rect(x0 + w / 2 + 6, y0 + h / 2 - 3, 8, 6)
      p.circle(x0 + 2, y0 + h / 2, 1.5)
      p.circle(x0 + w - 2, y0 + h / 2, 1.5)
      p.dimH(x0, x0 + w, y0 + h, y0 + h + 12)
      p.dimV(y0, y0 + h, x0, x0 - 12)
      p.text(x0, y0 - 14, 'インターロックスイッチ付き（右扉）', 3)
      p.bom(160, 75, [
        { no: '1', name: 'アルミフレーム 20×20', qty: '6', material: 'A6063' },
        { no: '2', name: 'ポリカーボネート板 t5', qty: '2', material: 'PC' },
        { no: '3', name: '安全スイッチ', qty: '1', material: '市販品' },
      ])
    },
  })

/** 台車（1:10） */
export const cart = (date: string, author: string) =>
  makeDoc({
    drawingNo: 'DW-CART-02', name: '台車 改造', material: 'SS400', author, date, scale: 10,
    build: (p) => {
      const x0 = 30, y0 = 90
      p.rect(x0, y0 + 10, 110, 4) // 荷台
      p.rect(x0 + 100, y0 + 14, 4, 50) // ハンドル
      p.line(x0 + 100, y0 + 64, x0 + 112, y0 + 64)
      p.circle(x0 + 10, y0 + 4, 5)
      p.circle(x0 + 96, y0 + 4, 5)
      p.rect(x0 + 6, y0 + 14, 40, 22, 'hidden')
      p.rect(x0 + 50, y0 + 14, 40, 22, 'hidden')
      p.rect(x0, y0 + 14, 3, 30) // 追加する枠
      p.dimH(x0, x0 + 110, y0 + 14, y0 + 75)
      p.dimV(y0, y0 + 64, x0 + 112, x0 + 125)
      p.text(x0, y0 - 14, '追加：落下防止枠（左側）H300', 3)
      p.bom(28, 18, [
        { no: '1', name: '落下防止枠 □25', qty: '1', material: 'SS400' },
        { no: '2', name: 'ボルト M8', qty: '4', material: 'SS400' },
      ])
    },
  })

/** 新しい図面（白紙）。表題欄の図名・作成者・日付は入れておく */
export const blankDrawing = (name: string, author: string, date: string) =>
  makeDoc({ drawingNo: '', name, material: '', author, date, scale: 1, build: () => {} })

/** 図面JSONから表題欄の図番・図名・材質を読み取る（要件 6_製図ページ「表題欄の読み取り」） */
export function readTitleBlock(json: string): { drawingNo: string; name: string; material: string } {
  try {
    const doc = JSON.parse(json)
    const f = (label: string) =>
      (doc?.titleBlock?.fields ?? []).find((x: { label: string; value?: string }) => x.label === label)?.value ?? ''
    return { drawingNo: f('図番'), name: f('図名'), material: f('材質') }
  } catch {
    return { drawingNo: '', name: '', material: '' }
  }
}

/** 部品表の行を読み取る（S15 に表示） */
export function readBom(json: string): { no: string; name: string; qty: string; material: string }[] {
  try {
    const doc = JSON.parse(json)
    return (doc?.entities ?? []).filter((e: { type: string }) => e.type === 'bom').flatMap((e: { rows: [] }) => e.rows ?? [])
  } catch {
    return []
  }
}

/** 保存時のチェック：製図ツールの図面か（format・version）・大きさ（5MBまで） */
export function validateDrawingJson(json: string): string | null {
  if (new Blob([json]).size > 5 * 1024 * 1024) return '図面の大きさが5MBを超えています'
  try {
    const doc = JSON.parse(json)
    if (doc?.format !== 'seizu-tool') return '製図ツールの図面ファイルではありません'
    if (doc?.version !== 1) return `未対応の図面データの版です（version: ${doc?.version}）`
    if (!Array.isArray(doc?.entities)) return '図面データが壊れています'
    return null
  } catch {
    return 'JSONとして読み込めないファイルです'
  }
}
