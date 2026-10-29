// メールBOX（デモ用）：アプリが送ったメールを受け取る Outlook 風の受信箱。
// メールの URL を押すと、承認依頼は承認画面（ログイン不要）、その他はログインを経由して該当の画面を開く。
import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCheck, ExternalLink, Inbox, Link2, Mail as MailIcon, MailOpen, Search, ShieldCheck } from 'lucide-react'
import { useApp } from '../../store'
import type { Mail } from '../../domain/types'
import { MAIL_FROM, mailName } from '../../domain/mails'
import { fmtDateTime, fmtMD } from '../../domain/format'
import { Avatar, Badge, Empty } from '../../components/ui'
import banner from '../../assets/img/mail_banner.webp'
import emptyImg from '../../assets/img/mailbox_empty.webp'
import './mailbox.css'

const TYPE_TONE: Record<string, string> = {
  M02: 'cyan', M12: 'cyan', M03: 'warn', M04: 'muted', M05: 'ok', M06: 'info', M07: 'info', M08: 'danger', M09: 'danger',
  M10: 'violet', M11: 'ok', M01: 'neutral', M13: 'violet', M14: 'violet', M15: 'violet',
}

function timeLabel(t: number) {
  const d = new Date(t)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return fmtMD(t)
}

export default function Mailbox() {
  const db = useApp((s) => s.db)
  const box = useApp((s) => s.mailBox)
  const mailId = useApp((s) => s.mailId)
  const selectMailBox = useApp((s) => s.selectMailBox)
  const openMail = useApp((s) => s.openMail)
  const [q, setQ] = useState('')

  const mails = useMemo(() => [...db.mails].sort((a, b) => b.sentAt - a.sentAt), [db.mails])
  const boxes = useMemo(() => {
    const m = new Map<string, { id: string; name: string; unread: number; total: number; last: number }>()
    for (const mail of mails) {
      for (const r of [...mail.to, ...mail.cc]) {
        const b = m.get(r.employeeId) ?? { id: r.employeeId, name: r.name, unread: 0, total: 0, last: 0 }
        b.total += 1
        if (!mail.read) b.unread += 1
        b.last = Math.max(b.last, mail.sentAt)
        m.set(r.employeeId, b)
      }
    }
    return [...m.values()].sort((a, b) => b.last - a.last)
  }, [mails])
  const list = mails.filter(
    (m) =>
      (box === 'all' || [...m.to, ...m.cc].some((r) => r.employeeId === box)) &&
      (!q || m.subject.includes(q) || m.to.some((r) => r.name.includes(q))),
  )
  const current = mails.find((m) => m.id === mailId) ?? null
  const unreadAll = mails.filter((m) => !m.read).length

  const markAll = () => {
    const s = useApp.getState()
    useApp.setState({ db: { ...s.db, mails: s.db.mails.map((m) => (list.includes(m) ? { ...m, read: true } : m)) } })
  }

  return (
    <div className="mailbox">
      <aside className="mb-boxes">
        <div className="mb-title">
          <Inbox size={18} /> メールBOX
          <span className="sample-chip" style={{ marginLeft: 'auto' }}>DEMO</span>
        </div>
        <p className="mb-note">
          <AlertTriangle size={13} /> サンプルのため、メールは実際には送信されていません。社員それぞれの受信箱（Outlook）に届いた想定で表示します。
        </p>
        <button className={`mb-box ${box === 'all' ? 'on' : ''}`} onClick={() => selectMailBox('all')}>
          <span className="mb-box-ic"><MailIcon size={15} /></span>
          <span className="grow">すべてのメール</span>
          {unreadAll > 0 && <span className="count-pill">{unreadAll}</span>}
        </button>
        <div className="side-group">受信箱（宛先の社員）</div>
        <div className="mb-box-list">
          {boxes.map((b) => {
            const e = db.employees.find((x) => x.id === b.id)
            return (
              <button key={b.id} className={`mb-box ${box === b.id ? 'on' : ''}`} onClick={() => selectMailBox(b.id)}>
                <Avatar emp={e} name={b.name} size="sm" color={e && (e.roles.equipment || e.roles.manager || e.roles.it) ? undefined : 'var(--role-approver)'} />
                <span className="grow">
                  <span className="mb-box-name">{b.name}</span>
                  <span className="mb-box-sub">{e?.position}・{db.departments.find((d) => d.id === e?.deptId)?.name}</span>
                </span>
                {b.unread > 0 ? <span className="count-pill">{b.unread}</span> : <span className="tiny tx-4 mono">{b.total}</span>}
              </button>
            )
          })}
        </div>
      </aside>

      <section className="mb-list">
        <div className="mb-list-head">
          <div className="mb-search">
            <Search size={15} />
            <input placeholder="件名・宛先で検索" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <button className="btn btn-sm btn-ghost" onClick={markAll} title="表示中のメールをすべて既読にする"><CheckCheck /> 既読</button>
        </div>
        <div className="mb-list-sub">
          <b>{box === 'all' ? 'すべてのメール' : boxes.find((b) => b.id === box)?.name + ' の受信箱'}</b>
          <span className="tx-3">{list.length}件</span>
        </div>
        <div className="mb-items">
          {list.map((m) => (
            <button key={m.id} className={`mb-item ${m.id === mailId ? 'on' : ''} ${m.read ? '' : 'unread'}`} onClick={() => openMail(m.id)}>
              <div className="row gap-6">
                {!m.read && <span className="mb-dot" />}
                <span className="mb-from">制作物依頼システム</span>
                <span className="grow" />
                <span className="mono tiny tx-3">{timeLabel(m.sentAt)}</span>
              </div>
              <div className="mb-subject">{m.subject}</div>
              <div className="row gap-6 mt-4">
                <Badge tone={TYPE_TONE[m.type]} sm>{m.type} {mailName(m.type)}</Badge>
                <span className="tiny tx-3 mb-to">宛先：{m.to.map((r) => r.name).join('、')}</span>
              </div>
            </button>
          ))}
          {!list.length && <Empty title="メールはありません" img={emptyImg} />}
        </div>
      </section>

      <section className="mb-read">
        {current ? <MailView mail={current} /> : (
          <div className="mb-read-empty">
            <img src={emptyImg} alt="" className="fade-img" />
            <b>メールを選んでください</b>
            <span className="small tx-3">承認依頼（M02）のURLを押すと、ログインせずに承認画面が開きます</span>
          </div>
        )}
      </section>
    </div>
  )
}

function MailView({ mail }: { mail: Mail }) {
  const openMailLink = useApp((s) => s.openMailLink)
  const approval = mail.link?.target.screen === 'S12'
  return (
    <div className="mb-mail" key={mail.id}>
      <div className="mb-mail-head">
        <h2>{mail.subject}</h2>
        <div className="mb-meta">
          <span className="mb-sender"><span className="mb-sender-ic"><MailIcon size={16} /></span></span>
          <div className="grow">
            <div><b>{MAIL_FROM.split(' <')[0]}</b> <span className="tx-3 mono small">&lt;{MAIL_FROM.split('<')[1]}</span></div>
            <div className="small tx-2">宛先：{mail.to.map((r) => `${r.name} <${r.email}>`).join('、')}</div>
            {mail.cc.length > 0 && <div className="small tx-3">CC：{mail.cc.map((r) => r.name).join('、')}</div>}
          </div>
          <div className="col gap-4" style={{ alignItems: 'flex-end' }}>
            <span className="mono small tx-2">{fmtDateTime(mail.sentAt)}</span>
            <Badge tone={TYPE_TONE[mail.type]} sm>{mail.type} {mailName(mail.type)}</Badge>
          </div>
        </div>
      </div>
      <div className="mb-mail-scroll">
        <article className="mb-letter">
          <div className="mb-banner">
            <img src={banner} alt="" />
            <div>
              <small>制作物依頼システム</small>
              <b>{mailName(mail.type)}</b>
            </div>
          </div>
          <div className="mb-letter-body">
            <p className="mb-greet">{mail.greeting}</p>
            {mail.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
            {mail.facts.length > 0 && (
              <table className="mb-facts">
                <tbody>
                  {mail.facts.map(([k, v]) => (
                    <tr key={k}><th>■ {k}</th><td>{v}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            {mail.link && (
              <div className={`mb-link ${approval ? 'approval' : ''}`}>
                <div className="mb-link-cap">▼ {mail.link.caption}</div>
                <button className="mb-url" onClick={() => openMailLink(mail)}>
                  <Link2 size={15} />
                  <span>{mail.link.url}</span>
                  <ExternalLink size={14} />
                </button>
                {mail.link.expiresAt && <div className="small tx-2 mt-4">有効期限：{fmtDateTime(mail.link.expiresAt)} まで</div>}
                <div className="mb-demo-hint">
                  {approval ? <ShieldCheck size={14} /> : <MailOpen size={14} />}
                  {approval
                    ? 'デモ：URLを押すと、承認者のブラウザでログインせずに承認画面（S12）が開きます'
                    : 'デモ：URLを押すと、ログイン画面を経由して該当の画面が開きます'}
                </div>
              </div>
            )}
            <div className="mb-notes">
              {mail.notes.map((n) => <div key={n}>{n}</div>)}
            </div>
          </div>
        </article>
      </div>
    </div>
  )
}
