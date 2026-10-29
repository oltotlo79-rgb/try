// ログイン後の画面の枠：左のメニュー・上部のアドレス表示・「メニュー」「ログアウト」（要件 S04 補足）
import type { ReactNode } from 'react'
import {
  BarChart3, ChartLine, ClipboardList, FilePlus2, Home, KeyRound, LayoutList, Lock, LogOut, MessageCircleQuestion, Settings, Timer,
} from 'lucide-react'
import { useApp, useMe } from '../store'
import { routePath, type Route } from '../router'
import { deptName, isAdmin, isEquipment, isIT, isLeaderPlus, pendingStep, roleLabel } from '../domain/rules'
import { BASE_URL } from '../domain/rules'
import { elapsedDays } from '../domain/format'
import { Avatar } from './ui'
import icon from '../assets/img/app_icon.png'

type NavKey = 'menu' | 'new' | 'my' | 'inquiry' | 'list' | 'progress' | 'results' | 'analytics' | 'settings'

function navOf(r: Route): NavKey | null {
  switch (r.s) {
    case 'S04': return 'menu'
    case 'S05': case 'S07': case 'S09': return 'new'
    case 'S10': case 'S11': return 'my'
    case 'S18': case 'S19': case 'S20': return 'inquiry'
    case 'S14': case 'S15': return 'list'
    case 'S16': return 'progress'
    case 'S17': return 'results'
    case 'S28': return 'analytics'
    case 'S21': case 'S22': case 'S23': case 'S24': case 'S25': case 'S26': case 'S27': return 'settings'
    default: return null
  }
}

export function Shell({ children }: { children: ReactNode }) {
  const me = useMe()!
  const route = useApp((s) => s.route)
  const go = useApp((s) => s.go)
  const db = useApp((s) => s.db)
  const now = Date.now()
  const active = navOf(route)
  const returned = db.requests.filter((r) => r.requester.employeeId === me.id && r.status === 'returned').length
  const unassigned = db.requests.filter((r) => r.status === 'circulated').length
  const openInq = db.inquiries.filter((q) => q.status === 'open').length
  const stalled = db.requests.filter((r) => {
    const p = r.status === 'circulating' ? pendingStep(r) : undefined
    return p?.sentAt && elapsedDays(p.sentAt, now) >= 3
  }).length

  const Item = ({ k, icon: Icon, label, onClick, count }: { k: NavKey; icon: typeof Home; label: string; onClick: () => void; count?: number }) => (
    <button className={`nav-item ${active === k ? 'on' : ''}`} onClick={onClick}>
      <Icon />
      {label}
      {!!count && <span className="count-pill">{count}</span>}
    </button>
  )

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="side-brand">
          <img src={icon} alt="" />
          <div>
            <b>制作物依頼</b>
            <small>REQUEST SYSTEM</small>
          </div>
        </div>
        <div className="side-group"><i style={{ background: 'var(--role-requester)' }} />すべての社員</div>
        <Item k="menu" icon={Home} label="メニュー" onClick={() => go({ s: 'S04' })} />
        <Item k="new" icon={FilePlus2} label="依頼する" onClick={() => useApp.getState().newDraft()} />
        <Item k="my" icon={ClipboardList} label="自分の依頼" count={returned} onClick={() => go({ s: 'S10' })} />
        <Item k="inquiry" icon={MessageCircleQuestion} label="問い合わせ" count={isIT(me) ? openInq : 0} onClick={() => go({ s: 'S18' })} />
        {isEquipment(me) && (
          <>
            <div className="side-group"><i style={{ background: 'var(--role-equipment)' }} />設備メンバー</div>
            <Item k="list" icon={LayoutList} label="依頼書一覧" count={isLeaderPlus(me) ? unassigned : 0} onClick={() => go({ s: 'S14' })} />
            <Item k="progress" icon={Timer} label="作業進捗" onClick={() => go({ s: 'S16' })} />
            <Item k="results" icon={BarChart3} label="成果確認" onClick={() => go({ s: 'S17' })} />
            <Item k="analytics" icon={ChartLine} label="データ分析" onClick={() => go({ s: 'S28' })} />
          </>
        )}
        {isAdmin(me) && (
          <>
            <div className="side-group"><i style={{ background: 'var(--role-admin)' }} />管理者・IT担当者</div>
            <Item k="settings" icon={Settings} label="設定" count={stalled} onClick={() => go({ s: 'S21' })} />
          </>
        )}
        <div className="side-foot">
          <div className="side-user">
            <Avatar emp={me} />
            <div className="grow">
              <b>{me.name}</b>
              <small>{deptName(db, me.deptId)}・{roleLabel(me)}</small>
            </div>
          </div>
          {isEquipment(me) && (
            <button className="nav-item mt-8" onClick={() => go({ s: 'S03' })}>
              <KeyRound /> パスワード変更
            </button>
          )}
          <button className="nav-item" onClick={() => useApp.getState().logout()}>
            <LogOut /> ログアウト
          </button>
        </div>
      </aside>
      <div className="main">
        <div className="topbar">
          <UrlBar route={route} />
          <span className="grow" />
          <span className="small tx-2 nowrap">
            {me.name}（{deptName(db, me.deptId)}{isEquipment(me) ? `・${roleLabel(me)}` : ''}）
          </span>
          <button className="btn btn-sm" onClick={() => go({ s: 'S04' })}><Home /> メニュー</button>
          <button className="btn btn-sm btn-ghost" onClick={() => useApp.getState().logout()}><LogOut /> ログアウト</button>
        </div>
        <div className="content" key={JSON.stringify(route)}>
          {children}
        </div>
      </div>
    </div>
  )
}

export function UrlBar({ route }: { route: Route }) {
  return (
    <div className="urlbar" title="アプリのアドレス（社内ネットワーク・HTTPS）">
      <Lock />
      <span>{BASE_URL.replace('https://', '')}</span>
      <b>{routePath(route)}</b>
    </div>
  )
}
