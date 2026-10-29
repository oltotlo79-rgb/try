// S05 依頼書入力：依頼の内容を入力する。差し戻し・引き戻し後の修正もこの画面で行う
import { useRef, useState } from 'react'
import {
  ArrowLeft, ArrowRight, AtSign, Building2, CalendarDays, FileJson, FileText, Paperclip, PenTool, Plus, Trash2, Undo2,
} from 'lucide-react'
import type { RouteOf } from '../../router'
import type { Attachment, Drawing, WorkRequest } from '../../domain/types'
import { useApp, useMe, useRequest } from '../../store'
import { Badge, CommentLog, Empty, Field, PageHead, Panel } from '../../components/ui'
import { DrawingThumb } from '../../components/DrawingThumb'
import { daysUntil, fileSizeLabel, fmtDate, toISODate } from '../../domain/format'
import { MAX_DRAWINGS } from '../../domain/rules'
import { readTitleBlock } from '../../data/drawings'
import './requester.css'

const TITLE_MAX = 100
const ATTACH_MAX = 10 * 1024 * 1024

/** 1枚ごとの最新の版 */
export function latestSheets(req: WorkRequest): Drawing[] {
  const m = new Map<number, Drawing>()
  for (const d of req.drawings) {
    const cur = m.get(d.sheetNo)
    if (!cur || d.revision > cur.revision) m.set(d.sheetNo, d)
  }
  return [...m.values()].sort((a, b) => a.sheetNo - b.sheetNo)
}

/** 依頼の流れ（依頼書入力 → 回覧者の入力 → 受付完了） */
export function FlowSteps({ step }: { step: 1 | 2 | 3 }) {
  const items = ['依頼書入力', '回覧者の入力', '受付完了']
  return (
    <div className="flow-steps">
      {items.map((label, i) => {
        const n = i + 1
        const cls = n === step ? 'on' : n < step ? 'done' : ''
        return (
          <div key={label} className="row" style={{ gap: 0 }}>
            {i > 0 && <span className={`flow-line ${n <= step ? 'done' : ''}`} />}
            <span className={`flow-step ${cls}`}>
              <span className="n">{n < step ? '✓' : `0${n}`}</span>
              {label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default function S05RequestForm({ route }: { route: RouteOf<'S05'> }) {
  const req = useRequest(route.reqId)
  const me = useMe()
  const go = useApp((s) => s.go)
  if (!req || !me) {
    return (
      <div className="page narrow">
        <Empty title="依頼書が見つかりません" action={<button className="btn" onClick={() => go({ s: 'S04' })}>メニューへ</button>} />
      </div>
    )
  }
  if (!['draft', 'returned', 'pulledBack'].includes(req.status)) {
    return (
      <div className="page narrow">
        <PageHead sid="S05" en="REQUEST FORM" title="依頼書入力" />
        <Empty
          title="この依頼は今は編集できません"
          desc="回覧中の依頼を修正するときは、先に「引き戻す」を押してください。"
          action={<button className="btn btn-primary" onClick={() => go({ s: 'S11', reqId: req.id })}>依頼の詳細へ</button>}
        />
      </div>
    )
  }
  return <Form req={req} key={req.id} />
}

function Form({ req }: { req: WorkRequest }) {
  const go = useApp((s) => s.go)
  const [title, setTitle] = useState(req.title)
  const [description, setDescription] = useState(req.description)
  const [dueDate, setDueDate] = useState(req.dueDate)
  const [errors, setErrors] = useState<{ title?: string; description?: string; dueDate?: string }>({})
  const jsonInput = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const now = Date.now()
  const today = toISODate(now)
  const isNew = req.status === 'draft' && !req.number
  const sheets = latestSheets(req)
  const nextSheet = (sheets.length ? Math.max(...sheets.map((d) => d.sheetNo)) : 0) + 1
  const fields = () => ({ title, description, dueDate })

  const validate = () => {
    const e: typeof errors = {}
    if (!title.trim()) e.title = '入力してください'
    else if (title.length > TITLE_MAX) e.title = `${TITLE_MAX}文字以内で入力してください`
    if (!description.trim()) e.description = '入力してください'
    if (!dueDate) e.dueDate = '入力してください'
    else if (daysUntil(dueDate, now) < 0) e.dueDate = '今日以降の日付を選んでください'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const openDrawing = (sheet: number) => {
    useApp.getState().saveDraft(req.id, fields())
    go({ s: 'S06', reqId: req.id, sheet, mode: 'edit', back: { s: 'S05', reqId: req.id } })
  }

  const importJson = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      useApp.getState().toast('danger', '図面の大きさが5MBを超えています')
      return
    }
    const text = await file.text()
    const st = useApp.getState()
    st.saveDraft(req.id, fields())
    const res = st.saveDrawing(req.id, null, text, false)
    if (res) {
      const tb = readTitleBlock(text)
      if (!title.trim() && tb.name) setTitle(tb.name)
      st.toast('ok', `図面を読み込みました（${res.sheetNo}枚目）`, tb.name ? `図名：${tb.name}` : file.name)
    }
  }

  const addAttachments = (files: FileList) => {
    const st = useApp.getState()
    const added: Attachment[] = []
    Array.from(files).forEach((f, i) => {
      const isPdf = f.type.includes('pdf') || f.name.toLowerCase().endsWith('.pdf')
      const isImg = /^image\/(jpeg|png)$/.test(f.type) || /\.(jpe?g|png)$/i.test(f.name)
      if (!isPdf && !isImg) {
        st.toast('danger', `「${f.name}」は添付できません`, 'JPG・PNG・PDFだけ添付できます')
        return
      }
      if (f.size > ATTACH_MAX) {
        st.toast('danger', `「${f.name}」は10MBを超えています`)
        return
      }
      added.push({
        id: `att-${Date.now()}-${i}`,
        fileName: f.name,
        kind: isPdf ? 'pdf' : 'image',
        src: isImg ? URL.createObjectURL(f) : undefined,
        size: f.size,
      })
    })
    if (added.length) st.saveDraft(req.id, { ...fields(), attachments: [...req.attachments, ...added] })
  }

  const removeAttachment = (id: string) =>
    useApp.getState().saveDraft(req.id, { ...fields(), attachments: req.attachments.filter((a) => a.id !== id) })

  const back = async () => {
    if (!isNew) {
      go({ s: 'S11', reqId: req.id })
      return
    }
    const dirty = title || description || dueDate || req.drawings.length || req.attachments.length
    if (dirty) {
      const ok = await useApp.getState().ask({
        title: '入力をやめてメニューに戻りますか？',
        body: '入力した内容・図面・補足資料は保存されません。',
        okLabel: '入力をやめる',
        tone: 'warn',
      })
      if (!ok) return
    }
    useApp.getState().discardDraft(req.id)
    go({ s: 'S04' })
  }

  const next = () => {
    if (!validate()) {
      useApp.getState().toast('warn', '入力されていない項目があります', '赤字の項目を確認してください')
      return
    }
    useApp.getState().saveDraft(req.id, fields())
    go({ s: 'S07', reqId: req.id })
  }

  const heading = req.status === 'returned' ? '依頼書の修正（差し戻し）' : req.status === 'pulledBack' ? '依頼書の修正（引き戻し）' : '依頼書入力'

  return (
    <div className="page">
      <PageHead
        sid="S05"
        en="REQUEST FORM"
        title={heading}
        desc={
          <>
            <span className="req-mark">＊</span>は必ず入力する項目です。依頼日・依頼部署・依頼者・メールアドレスは社員データから自動で入ります。
          </>
        }
        actions={req.number ? <Badge tone="cyan">{req.number}</Badge> : undefined}
      />
      <FlowSteps step={1} />

      {req.returnComments.length > 0 && (
        <Panel
          title="差し戻しコメント"
          icon={<Undo2 style={{ color: 'var(--warn)' }} />}
          sub="過去の差し戻し理由はすべて残ります。内容を修正して、もう一度依頼してください。"
          style={{ marginBottom: 20, borderColor: 'rgba(255,181,71,.28)' }}
        >
          <CommentLog comments={req.returnComments} />
        </Panel>
      )}

      <div className="grid-main-side">
        <Panel title="依頼の内容" icon={<FileText />}>
          <div className="col gap-20">
            <Field label={<>件名<span className="req-mark">＊</span><span className={`counter ${title.length > TITLE_MAX ? 'over' : ''}`}>{title.length}/{TITLE_MAX}</span></>}
              error={errors.title} hint="何の依頼か一目で分かる題名。図面を保存すると、空欄なら表題欄の「図名」が入ります。">
              <input
                className={`input ${errors.title ? 'invalid' : ''}`}
                placeholder="例）Aライン 部品置き台の製作"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
            <Field label="依頼内容" required error={errors.description} hint="サイズ・数量・使用場所・目的などを書いてください。">
              <textarea
                className={`textarea ${errors.description ? 'invalid' : ''}`}
                style={{ minHeight: 170 }}
                placeholder="例）幅900×奥行600×高さ800、2台。Aライン横に設置。部品箱を上下2段に置けるようにしたい。"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
            <Field label="納期" required error={errors.dueDate} hint="希望する完成日をカレンダーから選んでください（今日以降）。" style={{ maxWidth: 280 }}>
              <input
                type="date"
                className={`input mono ${errors.dueDate ? 'invalid' : ''}`}
                min={today}
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </Field>
          </div>
        </Panel>

        <Panel title="依頼者" icon={<Building2 />} sub="社員データから自動で入ります">
          <div className="auto-card">
            <div className="auto-row">
              <CalendarDays />
              <div className="grow">
                <small>依頼日</small>
                <b className="mono">{fmtDate(req.requestDate ?? Date.now())}</b>
              </div>
              <span className="auto-mark">自動</span>
            </div>
            <div className="auto-row">
              <Building2 />
              <div className="grow">
                <small>依頼部署・依頼者</small>
                <b>{req.requester.dept}　{req.requester.name}</b>
              </div>
              <span className="auto-mark">自動</span>
            </div>
            <div className="auto-row">
              <AtSign />
              <div className="grow" style={{ minWidth: 0 }}>
                <small>メールアドレス（お知らせメールはここに届きます）</small>
                <b className="mono small">{req.requester.email}</b>
              </div>
              <span className="auto-mark">自動</span>
            </div>
          </div>
        </Panel>
      </div>

      <Panel
        title="図面"
        icon={<PenTool />}
        sub={`任意・1件の依頼に${MAX_DRAWINGS}枚まで。クリックすると製図ページで開きます`}
        className="mt-24"
        actions={
          <div className="row">
            <button className="btn btn-sm" onClick={() => jsonInput.current?.click()}>
              <FileJson /> ファイルから読み込む
            </button>
            <button className="btn btn-sm btn-primary" disabled={sheets.length >= MAX_DRAWINGS} onClick={() => openDrawing(nextSheet)}>
              <PenTool /> 製図ページで描く・編集する
            </button>
          </div>
        }
      >
        <div className="thumbs">
          {sheets.map((d) => (
            <DrawingThumb
              key={d.id}
              json={d.json}
              caption={`${d.sheetNo}枚目　${d.name || '（図名なし）'}`}
              sub={`版${d.revision}`}
              onClick={() => openDrawing(d.sheetNo)}
            />
          ))}
          <button className="thumb-add" disabled={sheets.length >= MAX_DRAWINGS} onClick={() => openDrawing(nextSheet)}>
            <Plus />
            {sheets.length ? `${nextSheet}枚目の図面を描く` : '製図ページで図面を描く'}
            <span className="tiny tx-3">既存の図面（.json）は「ファイルから読み込む」</span>
          </button>
        </div>
        <input
          ref={jsonInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void importJson(f)
            e.target.value = ''
          }}
        />
      </Panel>

      <Panel
        title="補足資料"
        icon={<Paperclip />}
        sub="現場の写真やPDFを添付できます（任意・JPG/PNG/PDF・10MBまで）"
        className="mt-24"
        actions={
          <button className="btn btn-sm" onClick={() => fileInput.current?.click()}>
            <Paperclip /> ファイルを選択
          </button>
        }
      >
        {req.attachments.length ? (
          <div className="grid-2" style={{ gap: 10 }}>
            {req.attachments.map((a) => (
              <div key={a.id} className="attach" style={{ cursor: 'default' }}>
                {a.src ? <img src={a.src} alt="" /> : <span className="file-ic"><FileText size={18} /></span>}
                <div className="grow" style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.fileName}</div>
                  <div className="tiny tx-3">{a.kind === 'pdf' ? 'PDF' : '画像'}・{fileSizeLabel(a.size)}</div>
                </div>
                <button className="btn btn-sm btn-ghost btn-icon attach-x" title="添付をやめる" onClick={() => removeAttachment(a.id)}>
                  <Trash2 />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="row tx-3 small" style={{ padding: '6px 2px' }}>
            <Paperclip size={15} /> 添付はありません
          </div>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,.jpg,.jpeg,.png,.pdf,application/pdf"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) addAttachments(e.target.files)
            e.target.value = ''
          }}
        />
      </Panel>

      <div className="actionbar">
        <button className="btn btn-lg" onClick={back}>
          <ArrowLeft /> 戻る
        </button>
        <span className="grow small tx-3">「次へ」ではまだ送信しません。次の画面で回覧者を確認してから依頼します。</span>
        <button className="btn btn-lg btn-primary" onClick={next}>
          次へ（回覧者の入力） <ArrowRight />
        </button>
      </div>
    </div>
  )
}
