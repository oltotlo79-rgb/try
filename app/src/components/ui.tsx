// 共通の画面部品。画面はこの部品と app.css のクラスだけで組み立てる。
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle, Check, CheckCircle2, ChevronRight, CircleDot, FileText, Flag, Info, Mail, Search, ShieldCheck, Undo2, X, XCircle,
} from 'lucide-react'
import type { Employee, WorkRequest } from '../domain/types'
import { STATUS_TONE, currentRoundSteps, deptName, roleTone, statusShort, statusText } from '../domain/rules'
import { fmtMDHM, fileSizeLabel } from '../domain/format'
import { useApp } from '../store'
import emptyImg from '../assets/img/empty_state.webp'

export function PageHead({
  sid, en, title, desc, actions,
}: { sid: string; en: string; title: ReactNode; desc?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div className="grow">
        <div className="eyebrow">
          <span className="sid">{sid}</span>
          {en}
        </div>
        <h1 className="page-title">{title}</h1>
        {desc && <p className="page-desc">{desc}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  )
}

export function Panel({
  title, icon, sub, actions, children, tight, glow, className = '', foot, style,
}: {
  title?: ReactNode; icon?: ReactNode; sub?: ReactNode; actions?: ReactNode; children?: ReactNode; tight?: boolean
  glow?: boolean; className?: string; foot?: ReactNode; style?: React.CSSProperties
}) {
  return (
    <section className={`panel ${glow ? 'glow' : ''} ${className}`} style={style}>
      {(title || actions) && (
        <div className="panel-head">
          <div className="grow">
            <div className="panel-title">{icon}{title}</div>
            {sub && <div className="panel-sub">{sub}</div>}
          </div>
          {actions}
        </div>
      )}
      <div className={`panel-body ${tight ? 'tight' : ''}`}>{children}</div>
      {foot && <div className="panel-foot">{foot}</div>}
    </section>
  )
}

export function Badge({ tone = 'neutral', dot, children, sm }: { tone?: string; dot?: boolean; children: ReactNode; sm?: boolean }) {
  return (
    <span className={`badge tone-${tone} ${sm ? 'sm' : ''}`}>
      {dot && <span className="dot" />}
      {children}
    </span>
  )
}

/** 依頼書の状態（要件の色：回覧中=白、差し戻し・引き戻し=オレンジ、回覧完了・対応中=青、完了・取り下げ=グレー） */
export function StatusBadge({ req, long }: { req: WorkRequest; long?: boolean }) {
  return (
    <Badge tone={STATUS_TONE[req.status]} dot>
      {long ? statusText(req) : statusShort(req)}
    </Badge>
  )
}

export function Field({
  label, required, auto, error, hint, children, style,
}: { label: ReactNode; required?: boolean; auto?: boolean; error?: string | null; hint?: ReactNode; children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="field" style={style}>
      <label>
        {label}
        {required && <span className="req-mark">＊</span>}
        {auto && <span className="auto-mark">自動</span>}
      </label>
      {children}
      {error && (
        <span className="err-text">
          <AlertTriangle size={13} /> {error}
        </span>
      )}
      {!error && hint && <span className="hint">{hint}</span>}
    </div>
  )
}

export function Empty({ title, desc, img = emptyImg, action }: { title: string; desc?: string; img?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <img src={img} alt="" />
      <b>{title}</b>
      {desc && <span className="small mt-4">{desc}</span>}
      {action && <div className="mt-16">{action}</div>}
    </div>
  )
}

const ROLE_COLOR = { requester: 'var(--role-requester)', equipment: 'var(--role-equipment)', admin: 'var(--role-admin)' }

export function Avatar({ emp, name, size, color }: { emp?: Employee | null; name?: string; size?: 'sm' | 'lg'; color?: string }) {
  const n = emp?.name ?? name ?? '?'
  const c = color ?? (emp ? ROLE_COLOR[roleTone(emp)] : 'var(--cyan)')
  return (
    <span className={`avatar ${size ?? ''}`} style={{ ['--c' as string]: c }}>
      {n.slice(0, 1)}
    </span>
  )
}

export function RoleTags({ emp }: { emp: Employee }) {
  const tags: [string, string][] = []
  if (emp.roles.equipment) tags.push(['設備', 'role-equipment'])
  if (emp.roles.leader) tags.push(['リーダー', 'role-equipment'])
  if (emp.roles.manager) tags.push(['管理者', 'role-admin'])
  if (emp.roles.it) tags.push(['IT担当者', 'role-admin'])
  if (!tags.length) tags.push(['一般', 'role-requester'])
  return (
    <span className="row gap-4 wrap">
      {tags.map(([t, c]) => (
        <span key={t} className={`role-tag ${c}`}>{t}</span>
      ))}
    </span>
  )
}

export function ProgressBar({ value, tone }: { value: number; tone?: 'ok' | 'warn' }) {
  return (
    <div className="bar-cell">
      <div className={`bar ${tone ?? (value >= 100 ? 'ok' : '')}`}>
        <i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
      <span className="mono">{value}%</span>
    </div>
  )
}

/** 承認の進み具合（✔＝承認済み、▶＝承認待ち、－＝空欄のため飛ばし） */
export function ApprovalTrack({ req, meStepId }: { req: WorkRequest; meStepId?: string }) {
  const steps = currentRoundSteps(req)
  type Node = { key: string; role: string; name?: string; cls: string; icon: ReactNode; time?: string; me?: boolean }
  const nodes: Node[] = []
  const stepNode = (s: (typeof steps)[number]): Node => {
    const cls =
      s.result === 'approved' ? 'done'
      : s.result === 'proxy' ? 'done proxy'
      : s.result === 'pending' ? 'pending'
      : s.result === 'returned' ? 'returned'
      : s.result === 'cancelled' ? 'cancelled'
      : ''
    const icon =
      s.result === 'approved' ? <Check strokeWidth={3} />
      : s.result === 'proxy' ? <ShieldCheck />
      : s.result === 'returned' ? <Undo2 />
      : s.result === 'pending' ? <CircleDot />
      : s.result === 'cancelled' ? <X size={14} />
      : <span>{s.order}</span>
    return {
      key: s.id, role: s.role + (s.result === 'proxy' ? '（代理）' : ''), name: s.approver.name, cls, icon,
      time: s.actedAt ? fmtMDHM(s.actedAt) : s.result === 'pending' && s.sentAt ? `${fmtMDHM(s.sentAt)} 送信` : undefined,
      me: s.id === meStepId,
    }
  }
  if (!steps.length) {
    // まだ送信していない依頼：回覧者の予定を表示
    req.reviewers.forEach((id, i) =>
      nodes.push({ key: `r${i}`, role: `回覧者${i + 1}`, name: id ? '（予定）' : '（飛ばし）', cls: id ? '' : 'skip', icon: id ? <span>{i + 1}</span> : <span>－</span> }),
    )
  } else {
    for (let i = 1; i <= 3; i++) {
      const s = steps.find((x) => x.role === `回覧者${i}`)
      if (s) nodes.push(stepNode(s))
      else nodes.push({ key: `skip${i}`, role: `回覧者${i}`, name: '（飛ばし）', cls: 'skip', icon: <span>－</span> })
    }
    steps.filter((s) => s.kind === 'target').forEach((s) => nodes.push(stepNode(s)))
  }
  const finished = ['circulated', 'inProgress', 'done'].includes(req.status)
  nodes.push({ key: 'end', role: '完了', name: finished ? '回覧完了' : '', cls: `final ${finished ? 'done' : ''}`, icon: <Flag size={16} /> })
  return (
    <div className="track">
      {nodes.map((n) => (
        <div key={n.key} className={`track-step ${n.cls}`}>
          {n.me && <span className="track-me">あなた</span>}
          <div className="track-node">{n.icon}</div>
          <div className="track-role">{n.role}</div>
          {n.name && <div className="track-name">{n.name}</div>}
          {n.time && <div className="track-time">{n.time}</div>}
        </div>
      ))}
    </div>
  )
}

export function CommentLog({ comments }: { comments: string[] }) {
  if (!comments.length) return <span className="tx-3 small">差し戻しはありません</span>
  return (
    <div className="comment-log">
      {comments.map((c, i) => {
        const m = c.match(/^(【[^】]*】)(.*)$/)
        return (
          <div key={i}>
            <span className="mono small tx-warn">{m ? m[1] : ''}</span>
            <br />
            {m ? m[2] : c}
          </div>
        )
      })}
    </div>
  )
}

export function AttachmentList({ req }: { req: WorkRequest }) {
  const [view, setView] = useState<string | null>(null)
  if (!req.attachments.length) return <span className="tx-3 small">補足資料はありません</span>
  return (
    <div className="col gap-6">
      {req.attachments.map((a) => (
        <div key={a.id} className="attach" onClick={() => a.src && setView(a.src)}>
          {a.src ? <img src={a.src} alt="" /> : <span className="file-ic"><FileText size={18} /></span>}
          <div className="grow">
            <div style={{ fontSize: 13 }}>{a.fileName}</div>
            <div className="tiny tx-3">{fileSizeLabel(a.size)}・クリックで表示</div>
          </div>
        </div>
      ))}
      {view && (
        <div className="modal-back" onClick={() => setView(null)} style={{ cursor: 'zoom-out' }}>
          <img src={view} alt="" style={{ maxWidth: '86vw', maxHeight: '80vh', borderRadius: 14, boxShadow: 'var(--shadow-pop)' }} />
        </div>
      )}
    </div>
  )
}

export function Modal({
  title, icon, iconTone = 'cyan', children, foot, onClose, wide,
}: { title: ReactNode; icon?: ReactNode; iconTone?: string; children: ReactNode; foot?: ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`}>
        <div className="modal-head">
          {icon && <span className={`modal-icon tone-${iconTone}`}>{icon}</span>}
          <div className="grow">
            <h3>{title}</h3>
          </div>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose} aria-label="閉じる">
            <X />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {foot && <div className="modal-foot">{foot}</div>}
      </div>
    </div>
  )
}

/** 確認メッセージ（useApp().ask で開く） */
export function AskDialog() {
  const asking = useApp((s) => s.asking)
  if (!asking) return null
  const tone = asking.tone ?? 'primary'
  const btn = tone === 'danger' ? 'btn-danger' : tone === 'warn' ? 'btn-warn' : tone === 'ok' ? 'btn-ok' : 'btn-primary'
  const icon = tone === 'danger' ? <XCircle /> : tone === 'warn' ? <AlertTriangle /> : <Info />
  return (
    <Modal
      title={asking.title}
      icon={icon}
      iconTone={tone === 'primary' ? 'cyan' : tone}
      onClose={() => asking.resolve(false)}
      foot={
        <>
          <button className="btn" onClick={() => asking.resolve(false)}>{asking.cancelLabel ?? 'キャンセル'}</button>
          <button className={`btn ${btn}`} autoFocus onClick={() => asking.resolve(true)}>{asking.okLabel ?? 'OK'}</button>
        </>
      }
    >
      <div style={{ whiteSpace: 'pre-wrap' }}>{asking.body}</div>
    </Modal>
  )
}

export function Toasts() {
  const toasts = useApp((s) => s.toasts)
  const dismiss = useApp((s) => s.dismissToast)
  const setView = useApp((s) => s.setView)
  return (
    <div className="toasts">
      {toasts.map((t) =>
        t.kind === 'mail' ? (
          <div key={t.id} className="toast mail-toast">
            <div className="mail-toast-head">
              <span className="mail-toast-anim"><Mail /></span>
              <div className="grow">
                <b>メールが送信されました</b>
                <p className="sample-note">（サンプルのため実際には送信されていません）</p>
              </div>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => dismiss(t.id)}><X /></button>
            </div>
            <div className="mail-toast-list">
              {t.mails!.map((m) => (
                <div key={m.id}>
                  <span className="mono">{m.type}</span>
                  <span className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.subject}</span>
                  <span className="nowrap tx-3">→ {m.to.length > 1 ? `${m.to[0].name} ほか${m.to.length - 1}名` : m.to[0]?.name}</span>
                </div>
              ))}
            </div>
            <div className="mail-toast-foot">
              <span className="tiny tx-3">メールBOX（画面上部）で内容を確認できます</span>
              <button className="btn btn-sm btn-primary" onClick={() => { setView('mailbox'); dismiss(t.id) }}>
                <Mail /> メールBOXを開く
              </button>
            </div>
            <span className="timer" style={{ animationDuration: '9s' }} />
          </div>
        ) : (
          <div key={t.id} className="toast" onClick={() => dismiss(t.id)}>
            <span className={`toast-icon tone-${t.kind === 'ok' ? 'ok' : t.kind === 'danger' ? 'danger' : t.kind === 'warn' ? 'warn' : 'cyan'}`}>
              {t.kind === 'ok' ? <CheckCircle2 /> : t.kind === 'danger' ? <XCircle /> : t.kind === 'warn' ? <AlertTriangle /> : <Info />}
            </span>
            <div className="grow">
              <b>{t.title}</b>
              {t.body && <p>{t.body}</p>}
            </div>
          </div>
        ),
      )}
    </div>
  )
}

/** S08 回覧者を選ぶ：社員データから部署・氏名・役職で絞り込んで選ぶ（有効な社員だけ） */
export function EmployeePicker({
  title = '回覧者を選ぶ', initialDeptId, exclude = [], onPick, onClose, only,
}: {
  title?: string; initialDeptId?: string; exclude?: string[]; onPick: (e: Employee) => void; onClose: () => void
  only?: (e: Employee) => boolean
}) {
  const db = useApp((s) => s.db)
  const [dept, setDept] = useState(initialDeptId ?? 'all')
  const [q, setQ] = useState('')
  const [applied, setApplied] = useState({ dept: initialDeptId ?? 'all', q: '' })
  const list = useMemo(
    () =>
      db.employees.filter(
        (e) =>
          e.active &&
          (!only || only(e)) &&
          (applied.dept === 'all' || e.deptId === applied.dept) &&
          (!applied.q || e.name.includes(applied.q) || e.kana.includes(applied.q) || e.position.includes(applied.q)),
      ),
    [db, applied, only],
  )
  return (
    <Modal title={<span className="row"><span className="eyebrow" style={{ margin: 0 }}><span className="sid">S08</span></span>{title}</span>} wide onClose={onClose}
      foot={<button className="btn" onClick={onClose}>閉じる</button>}>
      <div className="row gap-16" style={{ alignItems: 'flex-end' }}>
        <Field label="① 部署" style={{ width: 200 }}>
          <select className="select" value={dept} onChange={(e) => setDept(e.target.value)}>
            <option value="all">すべての部署</option>
            {db.departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </Field>
        <Field label="② 氏名・役職" style={{ flex: 1 }}>
          <input className="input" placeholder="例）木村　／　組長" value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setApplied({ dept, q })} />
        </Field>
        <button className="btn btn-primary" onClick={() => setApplied({ dept, q })}><Search /> ③ 絞り込む</button>
      </div>
      <div className="panel mt-16" style={{ boxShadow: 'none' }}>
        <div className="table-wrap" style={{ maxHeight: 360 }}>
          <table className="table">
            <thead>
              <tr><th>氏名</th><th>部署</th><th>役職</th><th>メールアドレス</th><th></th></tr>
            </thead>
            <tbody>
              {list.map((e) => {
                const disabled = exclude.includes(e.id)
                return (
                  <tr key={e.id} className={disabled ? 'muted' : 'click'} onClick={() => !disabled && onPick(e)}>
                    <td><span className="row"><Avatar emp={e} size="sm" />{e.name}</span></td>
                    <td>{deptName(db, e.deptId)}</td>
                    <td>{e.position}</td>
                    <td className="mono small tx-2">{e.email}</td>
                    <td className="r">
                      <button className="btn btn-sm" disabled={disabled}>選ぶ <ChevronRight /></button>
                    </td>
                  </tr>
                )
              })}
              {!list.length && (
                <tr><td colSpan={5}><Empty title="条件に合う社員がいません" /></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <p className="hint mt-8">表示するのは社員データで「有効」の社員だけです。</p>
    </Modal>
  )
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, ReactNode][]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map(([v, label]) => (
        <button key={v} className={v === value ? 'on' : ''} onClick={() => onChange(v)} type="button">{label}</button>
      ))}
    </div>
  )
}
