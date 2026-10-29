// S18 問い合わせ一覧：これまでの問い合わせと回答の一覧。新しい問い合わせもここから
import { useMemo, useState } from 'react'
import { Home, Lock, MessageSquarePlus, Search, X } from 'lucide-react'
import type { RouteOf } from '../../router'
import type { Inquiry, InquiryStatus } from '../../domain/types'
import { useApp, useMe } from '../../store'
import { canViewInquiry, INQUIRY_STATUS_LABEL } from '../../domain/inquiries'
import { deptName, findEmployee, isIT } from '../../domain/rules'
import { fmtMD } from '../../domain/format'
import { Avatar, Badge, Empty, Field, PageHead, Panel } from '../../components/ui'
import inquiryImg from '../../assets/img/menu_inquiry.webp'
import './inquiry.css'

type Filter = 'all' | InquiryStatus

const STATUS_TONE: Record<InquiryStatus, string> = { open: 'warn', answered: 'cyan', resolved: 'muted' }

export function InquiryStatusBadge({ status }: { status: InquiryStatus }) {
  return (
    <Badge tone={STATUS_TONE[status]} dot>
      {INQUIRY_STATUS_LABEL[status]}
    </Badge>
  )
}

export function CategoryChip({ category }: { category: string }) {
  return <span className={`cat-chip cat-${category}`}>{category}</span>
}

function matches(q: Inquiry, keyword: string) {
  if (!keyword) return true
  const k = keyword.toLowerCase()
  return [q.title, q.body, q.number, ...q.messages.map((m) => m.body)].some((t) => t.toLowerCase().includes(k))
}

export default function S18InquiryList({ route }: { route: RouteOf<'S18'> }) {
  const me = useMe()!
  const db = useApp((s) => s.db)
  const go = useApp((s) => s.go)
  const initial: Filter = route.preset === 'open' ? 'open' : 'all'
  const [status, setStatus] = useState<Filter>(initial)
  const [keyword, setKeyword] = useState('')
  const [applied, setApplied] = useState<{ status: Filter; keyword: string }>({ status: initial, keyword: '' })

  const visible = useMemo(() => db.inquiries.filter((q) => canViewInquiry(q, me)), [db, me])
  const list = useMemo(
    () =>
      visible
        .filter((q) => (applied.status === 'all' || q.status === applied.status) && matches(q, applied.keyword.trim()))
        .sort((a, b) => b.createdAt - a.createdAt),
    [visible, applied],
  )
  const count = (s: InquiryStatus) => visible.filter((q) => q.status === s).length
  const apply = (s = status, k = keyword) => setApplied({ status: s, keyword: k })
  const clear = () => {
    setStatus('all')
    setKeyword('')
    setApplied({ status: 'all', keyword: '' })
  }

  return (
    <div className="page">
      <PageHead
        sid="S18"
        en="INQUIRIES"
        title="問い合わせ一覧"
        desc="アプリの使い方の質問・不具合の連絡・要望をIT担当者に送れます。同じ質問が過去にないか、先に探してみてください。"
        actions={
          <>
            <button className="btn" onClick={() => go({ s: 'S04' })}><Home /> メニューへ</button>
            <button className="btn btn-primary" onClick={() => go({ s: 'S19' })}><MessageSquarePlus /> 新しく問い合わせる</button>
          </>
        }
      />

      <div className="inq-hero">
        <div className="inq-hero-text">
          <b>困ったときは、まず過去の問い合わせを検索</b>
          <span className="small tx-2">
            「全員に公開」の問い合わせは、よくある質問として全社員が見られます。
            {isIT(me) ? ' あなたはIT担当者のため、「IT担当者だけ」の問い合わせも表示しています。' : ' 「IT担当者だけ」にした問い合わせは、あなたとIT担当者だけに表示されます。'}
          </span>
        </div>
        <div className="inq-hero-stats">
          {(['open', 'answered', 'resolved'] as InquiryStatus[]).map((s) => (
            <button key={s} className="inq-mini" onClick={() => { setStatus(s); apply(s) }}>
              <span>{INQUIRY_STATUS_LABEL[s]}</span>
              <b className={s === 'open' ? 'tx-warn' : s === 'answered' ? 'tx-cyan' : ''}>{count(s)}</b>
              <span className="tiny tx-3" style={{ display: 'inline' }}> 件</span>
            </button>
          ))}
        </div>
        <img src={inquiryImg} alt="" />
      </div>

      <Panel className="mt-16">
        <div className="inq-filter">
          <Field label="状態" style={{ width: 200 }}>
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value as Filter)}>
              <option value="all">すべて</option>
              <option value="open">未回答</option>
              <option value="answered">回答済み</option>
              <option value="resolved">解決</option>
            </select>
          </Field>
          <Field label="キーワード" style={{ flex: 1, minWidth: 260 }}>
            <input
              className="input"
              placeholder="件名・内容・回答から検索"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && apply()}
            />
          </Field>
          <button className="btn btn-ghost" onClick={clear}><X /> 条件クリア</button>
          <button className="btn btn-primary" onClick={() => apply()}><Search /> 絞り込む</button>
        </div>
      </Panel>

      <Panel
        className="mt-16"
        tight
        title="問い合わせの一覧"
        sub="行をクリックすると、質問と回答の詳細を開きます。未回答は黄色で表示します。"
        actions={<span className="small tx-3"><span className="mono tx-1">{list.length}</span> 件</span>}
      >
        {list.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 130 }}>番号</th>
                  <th style={{ width: 80 }}>日付</th>
                  <th style={{ width: 90 }}>分類</th>
                  <th>件名</th>
                  <th style={{ width: 170 }}>質問者</th>
                  <th style={{ width: 70 }} className="c">やり取り</th>
                  <th style={{ width: 120 }}>状態</th>
                </tr>
              </thead>
              <tbody>
                {list.map((q) => {
                  const asker = findEmployee(db, q.userId)
                  return (
                    <tr key={q.id} className={`click ${q.status === 'open' ? 'yellow' : ''}`} onClick={() => go({ s: 'S20', inqId: q.id })}>
                      <td className="id-cell">{q.number}</td>
                      <td className="mono small tx-2">{fmtMD(q.createdAt)}</td>
                      <td><CategoryChip category={q.category} /></td>
                      <td>
                        <div className="inq-title-cell">
                          <span className="t">{q.title}</span>
                          {q.visibility === 'it' && (
                            <span className="inq-lock" title="質問者本人とIT担当者だけに表示"><Lock /> IT担当者だけ</span>
                          )}
                          {q.userId === me.id && <Badge tone="cyan" sm>あなた</Badge>}
                        </div>
                      </td>
                      <td>
                        <span className="row gap-6">
                          <Avatar emp={asker} size="sm" />
                          <span>
                            {asker?.name ?? '—'}
                            <span className="tiny tx-3" style={{ display: 'block', lineHeight: 1.2 }}>{asker ? deptName(db, asker.deptId) : ''}</span>
                          </span>
                        </span>
                      </td>
                      <td className="c mono small tx-2">{q.messages.length}</td>
                      <td><InquiryStatusBadge status={q.status} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="条件に合う問い合わせはありません"
            desc="キーワードを変えるか、新しく問い合わせてください。"
            action={<button className="btn btn-primary" onClick={() => go({ s: 'S19' })}><MessageSquarePlus /> 新しく問い合わせる</button>}
          />
        )}
      </Panel>
    </div>
  )
}
