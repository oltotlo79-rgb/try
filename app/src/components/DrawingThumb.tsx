// 図面の縮小表示（F19）。製図ツールの図面JSONから簡易SVGを描く（線・円・円弧・矩形・連続線・文字・寸法・部品表・表題欄）
import { memo, useMemo } from 'react'
import { ExternalLink } from 'lucide-react'

const PAPERS: Record<string, [number, number]> = {
  A2: [420, 594], A3: [297, 420], A4: [210, 297], B3: [364, 515], B4: [257, 364], B5: [182, 257],
}
const BOM_W = [12, 45, 12, 25]
const BOM_FIELDS = ['no', 'name', 'qty', 'material'] as const
const BOM_HEAD = ['品番', '品名', '数量', '材質']

type E = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

function render(json: string) {
  let doc: E
  try {
    doc = JSON.parse(json)
  } catch {
    return null
  }
  const [pw, ph] = PAPERS[doc.paper?.size] ?? PAPERS.A4
  const [W, H] = doc.paper?.orientation === 'portrait' ? [pw, ph] : [ph, pw]
  const k = (doc.scale?.ratio?.[0] ?? 1) / (doc.scale?.ratio?.[1] ?? 1)
  const X = (x: number) => x * k
  const Y = (y: number) => H - y * k
  const els: React.ReactNode[] = []
  let key = 0
  const stroke = (e: E) => ({
    stroke: '#16202c',
    strokeWidth: e.lineType === 'solid' ? 0.5 : 0.25,
    strokeDasharray: e.lineType === 'dashed' ? '3 1.5' : e.lineType === 'chain' ? '8 1.5 1.5 1.5' : undefined,
    fill: 'none',
  })
  const arrow = (x: number, y: number, ang: number) => {
    const a = (ang * Math.PI) / 180
    const l = 2.5, w = 0.9
    const bx = x - Math.cos(a) * l, by = y + Math.sin(a) * l
    const nx = Math.sin(a) * w, ny = Math.cos(a) * w
    return <path key={key++} d={`M${x} ${y} L${bx + nx} ${by + ny} L${bx - nx} ${by - ny} Z`} fill="#16202c" />
  }
  for (const e of (doc.entities ?? []) as E[]) {
    const st = stroke(e)
    switch (e.type) {
      case 'line':
        els.push(<line key={key++} x1={X(e.x1)} y1={Y(e.y1)} x2={X(e.x2)} y2={Y(e.y2)} {...st} />)
        break
      case 'rect':
        els.push(<rect key={key++} x={X(e.x)} y={Y(e.y + e.height)} width={e.width * k} height={e.height * k} {...st} />)
        break
      case 'circle':
        els.push(<circle key={key++} cx={X(e.cx)} cy={Y(e.cy)} r={e.r * k} {...st} />)
        break
      case 'arc': {
        const a1 = (e.startAngle * Math.PI) / 180, a2 = (e.endAngle * Math.PI) / 180
        let sweep = e.endAngle - e.startAngle
        while (sweep < 0) sweep += 360
        const sx = X(e.cx + e.r * Math.cos(a1)), sy = Y(e.cy + e.r * Math.sin(a1))
        const ex = X(e.cx + e.r * Math.cos(a2)), ey = Y(e.cy + e.r * Math.sin(a2))
        els.push(<path key={key++} d={`M${sx} ${sy} A${e.r * k} ${e.r * k} 0 ${sweep > 180 ? 1 : 0} 0 ${ex} ${ey}`} {...st} />)
        break
      }
      case 'polyline':
        els.push(
          <polyline key={key++} points={(e.points as number[][]).map(([x, y]) => `${X(x)},${Y(y)}`).join(' ')} {...st} />,
        )
        break
      case 'text':
        els.push(<text key={key++} x={X(e.x)} y={Y(e.y)} fontSize={e.height ?? 3.5} fill="#16202c">{e.content}</text>)
        break
      case 'dim': {
        const t = { stroke: '#16202c', strokeWidth: 0.2 }
        if (e.dimType === 'linear') {
          const [x1, y1] = e.p1, [x2, y2] = e.p2
          if (e.orient === 'h') {
            const yo = e.offset
            const len = Math.abs(x2 - x1)
            els.push(<line key={key++} x1={X(x1)} y1={Y(y1)} x2={X(x1)} y2={Y(yo) - 1.5} {...t} />)
            els.push(<line key={key++} x1={X(x2)} y1={Y(y2)} x2={X(x2)} y2={Y(yo) - 1.5} {...t} />)
            els.push(<line key={key++} x1={X(Math.min(x1, x2))} y1={Y(yo)} x2={X(Math.max(x1, x2))} y2={Y(yo)} {...t} />)
            els.push(arrow(X(Math.min(x1, x2)), Y(yo), 180), arrow(X(Math.max(x1, x2)), Y(yo), 0))
            els.push(<text key={key++} x={(X(x1) + X(x2)) / 2} y={Y(yo) - 1.2} fontSize={3.5} textAnchor="middle" fill="#16202c">{e.override ?? Math.round(len * 10) / 10}</text>)
          } else if (e.orient === 'v') {
            const xo = e.offset
            const len = Math.abs(y2 - y1)
            els.push(<line key={key++} x1={X(x1)} y1={Y(y1)} x2={X(xo) - 1.5} y2={Y(y1)} {...t} />)
            els.push(<line key={key++} x1={X(x2)} y1={Y(y2)} x2={X(xo) - 1.5} y2={Y(y2)} {...t} />)
            els.push(<line key={key++} x1={X(xo)} y1={Y(Math.min(y1, y2))} x2={X(xo)} y2={Y(Math.max(y1, y2))} {...t} />)
            els.push(arrow(X(xo), Y(Math.min(y1, y2)), -90), arrow(X(xo), Y(Math.max(y1, y2)), 90))
            const my = (Y(y1) + Y(y2)) / 2
            els.push(<text key={key++} x={X(xo) - 1.2} y={my} fontSize={3.5} textAnchor="middle" fill="#16202c" transform={`rotate(-90 ${X(xo) - 1.2} ${my})`}>{e.override ?? Math.round(len * 10) / 10}</text>)
          }
        } else if (e.dimType === 'dia' || e.dimType === 'rad') {
          const a = (e.angleDeg * Math.PI) / 180
          const cx = X(e.cx), cy = Y(e.cy), r = e.r * k
          const ex = cx + Math.cos(a) * r, ey = cy - Math.sin(a) * r
          const tx = ex + Math.cos(a) * 7, ty = ey - Math.sin(a) * 7
          const sx = e.dimType === 'dia' ? cx - Math.cos(a) * r : cx, sy = e.dimType === 'dia' ? cy + Math.sin(a) * r : cy
          els.push(<line key={key++} x1={sx} y1={sy} x2={tx} y2={ty} {...t} />, arrow(ex, ey, e.angleDeg))
          const label = e.override ?? (e.dimType === 'dia' ? `φ${Math.round(e.r * 2 * 10) / 10}` : `R${e.r}`)
          els.push(<text key={key++} x={tx + 1} y={ty - 0.8} fontSize={3.5} fill="#16202c">{label}</text>)
        }
        break
      }
      case 'bom': {
        const rows = (e.rows ?? []) as E[]
        const x0 = X(e.x)
        const totalW = BOM_W.reduce((a, b) => a + b, 0)
        const totalH = 8 * (rows.length + 1)
        const top = Y(e.y) - totalH
        els.push(<rect key={key++} x={x0} y={top} width={totalW} height={totalH} fill="none" stroke="#16202c" strokeWidth={0.35} />)
        for (let i = 1; i <= rows.length; i++) els.push(<line key={key++} x1={x0} y1={top + 8 * i} x2={x0 + totalW} y2={top + 8 * i} stroke="#16202c" strokeWidth={0.25} />)
        let cx = x0
        BOM_W.forEach((w, c) => {
          if (c > 0) els.push(<line key={key++} x1={cx} y1={top} x2={cx} y2={top + totalH} stroke="#16202c" strokeWidth={0.25} />)
          els.push(<text key={key++} x={cx + 1.5} y={top + 5.5} fontSize={3} fill="#16202c">{BOM_HEAD[c]}</text>)
          rows.forEach((r, i) => els.push(<text key={key++} x={cx + 1.5} y={top + 8 * (i + 1) + 5.5} fontSize={3} fill="#16202c">{String(r[BOM_FIELDS[c]] ?? '')}</text>))
          cx += w
        })
        break
      }
    }
  }
  // 表題欄（右下）
  const fields = (doc.titleBlock?.fields ?? []) as E[]
  const tbW = 90, rowH = 8, labW = 25
  const tbX = W - 10 - tbW
  const tbTop = H - 10 - rowH * fields.length
  const tbText = (f: E) =>
    f.bind === 'scale' ? `${doc.scale.ratio[0]}:${doc.scale.ratio[1]}`
    : f.bind === 'paper' ? `${doc.paper.size} ${doc.paper.orientation === 'landscape' ? '横' : '縦'}`
    : (f.value ?? '')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg" fontFamily="IBM Plex Sans JP, Yu Gothic UI, sans-serif">
      <rect x={0} y={0} width={W} height={H} fill="#fbfcfe" />
      <g opacity={0.5}>
        <pattern id="g5" width={5} height={5} patternUnits="userSpaceOnUse">
          <path d="M5 0H0V5" fill="none" stroke="#dfe6ef" strokeWidth={0.15} />
        </pattern>
        <rect x={10} y={10} width={W - 20} height={H - 20} fill="url(#g5)" />
      </g>
      <rect x={10} y={10} width={W - 20} height={H - 20} fill="none" stroke="#16202c" strokeWidth={0.7} />
      {els}
      {fields.length > 0 && (
        <g>
          <rect x={tbX} y={tbTop} width={tbW} height={rowH * fields.length} fill="#fff" stroke="#16202c" strokeWidth={0.35} />
          <line x1={tbX + labW} y1={tbTop} x2={tbX + labW} y2={tbTop + rowH * fields.length} stroke="#16202c" strokeWidth={0.35} />
          {fields.map((f, i) => (
            <g key={i}>
              {i > 0 && <line x1={tbX} y1={tbTop + rowH * i} x2={tbX + tbW} y2={tbTop + rowH * i} stroke="#16202c" strokeWidth={0.25} />}
              <text x={tbX + 2} y={tbTop + rowH * i + 5.2} fontSize={2.5} fill="#16202c">{f.label}</text>
              <text x={tbX + labW + 2} y={tbTop + rowH * i + 5.6} fontSize={3.5} fill="#16202c">{tbText(f)}</text>
            </g>
          ))}
        </g>
      )}
    </svg>
  )
}

export const DrawingSvg = memo(function DrawingSvg({ json }: { json: string }) {
  const svg = useMemo(() => render(json), [json])
  return svg ?? <div style={{ padding: 30, color: '#666' }}>図面を表示できません</div>
})

export function DrawingThumb({
  json, caption, sub, onClick,
}: { json: string; caption?: string; sub?: string; onClick?: () => void }) {
  return (
    <div className="drawing-thumb" onClick={onClick} role="button" title="クリックで製図ページを開く">
      <DrawingSvg json={json} />
      {(caption || sub) && (
        <div className="thumb-cap">
          <b style={{ fontWeight: 600 }}>{caption}</b>
          <span className="grow" />
          {sub && <span className="mono tiny" style={{ opacity: 0.8 }}>{sub}</span>}
        </div>
      )}
      <span className="thumb-open btn btn-sm" style={{ background: 'rgba(5,8,12,.75)' }}>
        <ExternalLink /> 開く
      </span>
    </div>
  )
}
