// S06 製図ページ：既存の製図ツール（seizu.html・無変更のコピー）をアプリの1ページとして組み込む。
// 読み込みはツールのドラッグ＆ドロップ処理、保存は保存ダイアログの関数を差し替えて受け取る（要件 6_製図ページ）。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Download, Eye, FilePlus2, Layers, PencilRuler, Printer, Save, ShieldCheck, Wrench } from 'lucide-react'
import type { RouteOf } from '../../router'
import { useApp, useMe, useRequest } from '../../store'
import { blankDrawing } from '../../data/drawings'
import { fmtDateTime, toISODate } from '../../domain/format'
import { MAX_DRAWINGS } from '../../domain/rules'
import { saveTextFile } from '../../lib/files'
import { Badge } from '../../components/ui'
import { UrlBar } from '../../components/Shell'
import './drawing.css'

type ToolWindow = Window & {
  showSaveFilePicker?: unknown
  DataTransfer: typeof DataTransfer
  File: typeof File
  DragEvent: typeof DragEvent
}

const VIEW_CSS = `
#tabs .tab[data-tab="draw"], #tabs .tab[data-tab="annotate"], #tabs .tab[data-tab="edit"],
#ribbon .panel[data-panel="draw"], #ribbon .panel[data-panel="annotate"], #ribbon .panel[data-panel="edit"],
#ribbon .group.style, #undo, #redo, #file-open { display: none !important; }`
const COMMON_CSS = `#file-new, #file-save, #file-saveas { display: none !important; } #restore-banner { display: none !important; }`

function clearToolBackup(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.deleteDatabase('seizu-tool')
      req.onsuccess = req.onerror = req.onblocked = () => resolve()
    } catch {
      resolve()
    }
  })
}

export default function S06Drawing({ route }: { route: RouteOf<'S06'> }) {
  const req = useRequest(route.reqId)
  const me = useMe()
  const go = useApp((s) => s.go)
  const frame = useRef<HTMLIFrameElement>(null)
  const capture = useRef<((text: string) => void) | null>(null)
  const [ready, setReady] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [sheet, setSheet] = useState(route.sheet)
  const sheets = useMemo(() => {
    const map = new Map<number, NonNullable<typeof req>['drawings']>()
    for (const d of req?.drawings ?? []) map.set(d.sheetNo, [...(map.get(d.sheetNo) ?? []), d])
    for (const list of map.values()) list.sort((a, b) => a.revision - b.revision)
    return [...map.entries()].sort((a, b) => a[0] - b[0])
  }, [req])
  const revisions = sheets.find(([n]) => n === sheet)?.[1] ?? []
  const [revision, setRevision] = useState<number | null>(null)
  const current = revisions.find((d) => d.revision === revision) ?? revisions[revisions.length - 1]
  const mode = route.mode
  const canEdit = mode === 'edit'
  const isNew = !current

  // 製図ツールの復元データを消してから読み込む（復元のお知らせを出さない）
  useEffect(() => {
    clearToolBackup().then(() => setReady(true))
  }, [])

  const docJson = useMemo(
    () =>
      current?.json ??
      blankDrawing(req?.title || `図面${sheet}`, me?.name ?? '', toISODate(Date.now()).replace(/-/g, '/')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current?.id, current?.savedAt, sheet],
  )

  const onLoad = useCallback(() => {
    const w = frame.current?.contentWindow as ToolWindow | null
    const doc = frame.current?.contentDocument
    if (!w || !doc) return
    const style = doc.createElement('style')
    style.textContent = COMMON_CSS + (canEdit ? '' : VIEW_CSS)
    doc.head.appendChild(style)
    if (!canEdit) (doc.querySelector('#tabs .tab[data-tab="view"]') as HTMLButtonElement | null)?.click()
    // 保存ダイアログを差し替え、書き込まれる図面データを受け取る
    w.showSaveFilePicker = async () => ({
      name: '図面.json',
      createWritable: async () => {
        let text = ''
        return {
          write: async (t: unknown) => {
            text += typeof t === 'string' ? t : await new Response(t as Blob).text()
          },
          close: async () => {
            capture.current?.(text)
            capture.current = null
          },
        }
      },
    })
    // 図面を読み込む（ツールのドラッグ＆ドロップ処理を利用）
    const dt = new w.DataTransfer()
    dt.items.add(new w.File([docJson], `${current?.drawingNo || '図面'}.json`, { type: 'application/json' }))
    w.dispatchEvent(new w.DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }))
    setTimeout(() => setLoaded(true), 250)
  }, [canEdit, docJson, current?.drawingNo])

  /** ツールから今の図面データ（JSON）を取り出す */
  const extract = () =>
    new Promise<string>((resolve, reject) => {
      const doc = frame.current?.contentDocument
      const btn = doc?.getElementById('file-saveas') as HTMLButtonElement | null
      if (!btn) return reject(new Error('製図ツールが読み込まれていません'))
      const timer = setTimeout(() => reject(new Error('図面データを取り出せませんでした')), 3000)
      capture.current = (t) => {
        clearTimeout(timer)
        resolve(t)
      }
      btn.click()
    })

  const isDirty = () => !!frame.current?.contentDocument?.title.startsWith('* ')

  const leave = async () => {
    if (isDirty()) {
      const ok = await useApp.getState().ask({ title: '保存していない変更があります', body: '変更を破棄して元の画面に戻りますか？', okLabel: '破棄して戻る', tone: 'warn' })
      if (!ok) return
    }
    go(route.back)
  }

  const saveToRequest = async (asNewRevision: boolean) => {
    try {
      const json = await extract()
      const res = useApp.getState().saveDrawing(route.reqId, isNew ? null : sheet, json, asNewRevision)
      if (!res) return
      if (asNewRevision) {
        useApp.getState().toast('ok', `版${res.revision}として保存しました`, '依頼者の原図（版1）はそのまま残っています')
        setRevision(res.revision)
      } else {
        useApp.getState().toast('ok', '図面を依頼書に保存しました', `${res.sheetNo}枚目（版${res.revision}）`)
        go(route.back)
      }
    } catch (e) {
      useApp.getState().toast('danger', (e as Error).message)
    }
  }

  const saveJson = async () => {
    try {
      const json = await extract()
      await saveTextFile(`${current?.drawingNo || current?.name || '図面'}.json`, json, 'json')
    } catch (e) {
      useApp.getState().toast('danger', (e as Error).message)
    }
  }

  const print = () => (frame.current?.contentDocument?.getElementById('print') as HTMLButtonElement | null)?.click()

  const switchSheet = async (n: number) => {
    if (n === sheet) return
    if (isDirty()) {
      const ok = await useApp.getState().ask({ title: '保存していない変更があります', body: '変更を破棄して図面を切り替えますか？', okLabel: '破棄して切り替える', tone: 'warn' })
      if (!ok) return
    }
    setLoaded(false)
    setRevision(null)
    setSheet(n)
  }

  if (!req) return null
  const nextSheet = (sheets.length ? Math.max(...sheets.map(([n]) => n)) : 0) + 1
  const modeBadge =
    mode === 'edit' ? <Badge tone="ok" dot>作成・編集</Badge>
    : mode === 'equipment' ? <Badge tone="info" dot>設備（閲覧・版の保存）</Badge>
    : <Badge tone="neutral" dot>閲覧のみ</Badge>

  return (
    <div className="drawing-page">
      <div className="drawing-bar">
        <button className="btn btn-sm btn-ghost" onClick={leave}><ArrowLeft /> 閉じる</button>
        <div className="drawing-title">
          <div className="eyebrow" style={{ margin: 0 }}><span className="sid">S06</span>DRAWING</div>
          <b>製図ページ</b>
          <span className="tx-3 small nowrap">{req.number || '新しい依頼'}　{req.title || '（件名未入力）'}</span>
        </div>
        {modeBadge}
        <span className="grow" />
        {route.token && <UrlBar route={{ s: 'S12', token: route.token }} />}
        <div className="sheet-switch">
          <Layers size={15} />
          <select className="select" value={isNew ? 'new' : String(sheet)} onChange={(e) => switchSheet(Number(e.target.value))}>
            {sheets.map(([n, list]) => (
              <option key={n} value={n}>
                {n}枚目 {list[list.length - 1].name || '（図名なし）'}（版{list[list.length - 1].revision}）
              </option>
            ))}
            {isNew && <option value="new">{sheet}枚目（新しい図面）</option>}
          </select>
          {canEdit && !isNew && sheets.length < MAX_DRAWINGS && (
            <button className="btn btn-sm" onClick={() => switchSheet(nextSheet)}><FilePlus2 /> 新しい図面</button>
          )}
        </div>
        {revisions.length > 1 && (
          <div className="seg">
            {revisions.map((d) => (
              <button key={d.revision} className={d.revision === current?.revision ? 'on' : ''} onClick={() => { setLoaded(false); setRevision(d.revision) }}>
                版{d.revision}
              </button>
            ))}
          </div>
        )}
        <button className="btn btn-sm" onClick={saveJson} title="図面を.jsonファイルとして保存する"><Download /> JSONで保存</button>
        <button className="btn btn-sm" onClick={print} title="用紙サイズ・向きに合わせて印刷画面を開く（PDFに保存も可）"><Printer /> 印刷・PDF</button>
        {mode === 'equipment' && !isNew && (
          <button className="btn btn-sm btn-violet" onClick={() => saveToRequest(true)} title="依頼者の原図を残したまま、製作用の新しい版として保存する">
            <Wrench /> 版{(revisions[revisions.length - 1]?.revision ?? 1) + 1}として保存
          </button>
        )}
        {canEdit && (
          <button className="btn btn-sm btn-primary" onClick={() => saveToRequest(false)}><Save /> 依頼書に保存</button>
        )}
      </div>
      <div className="drawing-sub">
        {current ? (
          <>
            <span className="row gap-6">
              {current.revision === 1 ? <PencilRuler size={14} /> : <ShieldCheck size={14} />}
              版{current.revision}：{current.revision === 1 ? '依頼者の原図' : '設備側の修正版'}
            </span>
            <span>図番 <b className="mono">{current.drawingNo || '—'}</b></span>
            <span>材質 <b>{current.material || '—'}</b></span>
            <span>保存 {current.savedBy}・{fmtDateTime(current.savedAt)}</span>
          </>
        ) : (
          <span className="row gap-6"><FilePlus2 size={14} /> 新しい図面です。描き終えたら右上の「依頼書に保存」を押してください。</span>
        )}
        <span className="grow" />
        {!canEdit && <span className="row gap-6 tx-warn"><Eye size={14} /> 閲覧のみ：画面上で変更しても保存されません</span>}
        <span className="tx-3">製図ツールの使い方は ツール右上の「？ ヘルプ」（F1）</span>
      </div>
      <div className="drawing-frame">
        {ready && (
          <iframe
            key={`${sheet}-${current?.id ?? 'new'}-${current?.revision ?? 0}`}
            ref={frame}
            src="/seizu/seizu.html"
            title="製図ツール"
            onLoad={onLoad}
          />
        )}
        {!loaded && <div className="drawing-loading"><span className="spinner" />製図ツールを読み込んでいます…</div>}
      </div>
    </div>
  )
}
