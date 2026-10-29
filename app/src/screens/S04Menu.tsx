// S04 メニュー：ログイン後の最初の画面。お知らせ（自分に関係する件数）と各機能への入口。ボタンは権限で変わる
import type { ReactNode } from 'react'
import { AlertTriangle, ArrowRight, BellRing, ChevronRight, ClipboardCheck, Hourglass, MessageCircleQuestion, Undo2, UserRoundCog } from 'lucide-react'
import type { RouteOf, Route } from '../router'
import { useApp, useMe } from '../store'
import { RoleTags } from '../components/ui'
import { deptName, isAdmin, isEquipment, isIT, isLeaderPlus, pendingStep } from '../domain/rules'
import { elapsedDays, fmtDate } from '../domain/format'
import hero from '../assets/img/menu_hero.webp'
import imgRequest from '../assets/img/menu_request.webp'
import imgMy from '../assets/img/menu_my_requests.webp'
import imgInquiry from '../assets/img/menu_inquiry.webp'
import imgList from '../assets/img/menu_request_list.webp'
import imgProgress from '../assets/img/menu_progress.webp'
import imgResults from '../assets/img/menu_results.webp'
import imgSettings from '../assets/img/menu_settings.webp'
import imgAnalytics from '../assets/img/menu_analytics.webp'
import './menu.css'

const WEEK = ['日', '月', '火', '水', '木', '金', '土']

function greeting() {
  const h = new Date().getHours()
  return h < 11 ? 'おはようございます' : h < 18 ? 'こんにちは' : 'おつかれさまです'
}

export default function S04Menu({ route }: { route: RouteOf<'S04'> }) {
  void route
  const me = useMe()!
  const db = useApp((s) => s.db)
  const go = useApp((s) => s.go)
  const now = Date.now()
  const mine = db.requests.filter((r) => r.requester.employeeId === me.id && r.number)
  const returned = mine.filter((r) => r.status === 'returned').length
  const circulating = mine.filter((r) => r.status === 'circulating').length
  const unassigned = db.requests.filter((r) => r.status === 'circulated').length
  const assigned = db.requests.filter((r) => r.status === 'inProgress' && r.assignees.includes(me.id)).length
  const openInq = db.inquiries.filter((q) => q.status === 'open').length
  const stalled = db.requests.filter((r) => {
    const p = r.status === 'circulating' ? pendingStep(r) : undefined
    return p?.sentAt && elapsedDays(p.sentAt, now) >= 3
  }).length

  const notices: { show: boolean; icon: ReactNode; label: string; count: number; tone: string; to: Route }[] = [
    { show: true, icon: <Undo2 />, label: 'あなたの依頼：差し戻されている依頼', count: returned, tone: 'warn', to: { s: 'S10', filter: 'returned' } },
    { show: true, icon: <Hourglass />, label: 'あなたの依頼：回覧中の依頼', count: circulating, tone: 'cyan', to: { s: 'S10', filter: 'circulating' } },
    { show: isLeaderPlus(me), icon: <UserRoundCog />, label: '担当者が決まっていない依頼（設備メンバー）', count: unassigned, tone: 'info', to: { s: 'S14', preset: 'unassigned' } },
    { show: isEquipment(me), icon: <ClipboardCheck />, label: 'あなたが担当中の依頼（設備メンバー）', count: assigned, tone: 'info', to: { s: 'S14', preset: 'mine' } },
    { show: isIT(me), icon: <MessageCircleQuestion />, label: '未回答の問い合わせ（IT担当者）', count: openInq, tone: 'warn', to: { s: 'S18', preset: 'open' } },
    { show: isAdmin(me), icon: <AlertTriangle />, label: '承認が3日以上止まっている依頼（管理者）', count: stalled, tone: 'danger', to: { s: 'S27' } },
  ]
  const d = new Date()

  return (
    <div className="page wide">
      <section className="menu-hero">
        <img src={hero} alt="" />
        <div className="menu-hero-shade" />
        <div className="menu-hero-body">
          <div className="eyebrow"><span className="sid">S04</span>DASHBOARD · {fmtDate(now)}（{WEEK[d.getDay()]}）</div>
          <h1>{greeting()}、{me.name}さん</h1>
          <div className="row mt-8 small tx-2">
            {deptName(db, me.deptId)}・{me.position}
            <RoleTags emp={me} />
          </div>
        </div>
        <div className="menu-notices">
          <div className="menu-notices-head"><BellRing size={15} /> お知らせ<span className="tx-3 tiny">クリックで該当の一覧へ</span></div>
          {notices.filter((n) => n.show).map((n) => (
            <button key={n.label} className={`notice-row ${n.count ? '' : 'zero'}`} onClick={() => go(n.to)}>
              <span className={`notice-ic tone-${n.tone}`}>{n.icon}</span>
              <span className="grow">{n.label}</span>
              <span className={`notice-count ${n.count ? `tx-${n.tone === 'cyan' || n.tone === 'info' ? 'cyan' : n.tone}` : ''}`}>{n.count}<small>件</small></span>
              <ChevronRight size={15} className="tx-3" />
            </button>
          ))}
        </div>
      </section>

      <Section label="すべての社員" color="var(--role-requester)">
        <Tile no="01" img={imgRequest} title="依頼する" desc="件名・内容・納期を入力し、図面を描いて依頼する" onClick={() => useApp.getState().newDraft()} />
        <Tile no="02" img={imgMy} title="自分の依頼" desc="出した依頼の承認状況と製作の進み具合を見る" badge={returned ? `差し戻し ${returned}件` : undefined} onClick={() => go({ s: 'S10' })} />
        <Tile no="03" img={imgInquiry} title="問い合わせ" desc="使い方の質問・不具合の連絡・要望。過去の回答も見られる" onClick={() => go({ s: 'S18' })} />
      </Section>
      {isEquipment(me) && (
        <Section label="設備メンバー" color="var(--role-equipment)">
          <Tile no="04" img={imgList} title="依頼書一覧" desc="すべての依頼書と進捗を見る・更新する" badge={isLeaderPlus(me) && unassigned ? `担当者未定 ${unassigned}件` : undefined} onClick={() => go({ s: 'S14' })} />
          <Tile no="05" img={imgProgress} title="作業進捗" desc="メンバーごとの作業（依頼書＋依頼書以外）を見る" onClick={() => go({ s: 'S16' })} />
          <Tile no="06" img={imgResults} title="成果確認" desc="担当者ごとの貢献額をグラフと表で比較する" onClick={() => go({ s: 'S17' })} />
          <Tile no="07" img={imgAnalytics} title="データ分析" desc="依頼の傾向・納期遵守率・リードタイム・承認にかかる時間・負荷を分析する" badge="追加提案" onClick={() => go({ s: 'S28' })} />
        </Section>
      )}
      {isAdmin(me) && (
        <Section label="管理者・IT担当者" color="var(--role-admin)">
          <Tile no="08" img={imgSettings} title="設定" desc="ユーザー・社員データ・回覧先・依頼書の管理（代理承認）" violet badge={stalled ? `承認停滞 ${stalled}件` : undefined} onClick={() => go({ s: 'S21' })} />
        </Section>
      )}
    </div>
  )
}

function Section({ label, color, children }: { label: string; color: string; children: ReactNode }) {
  return (
    <div className="menu-section">
      <div className="section-label"><i style={{ width: 7, height: 7, borderRadius: 2, background: color, display: 'inline-block' }} />{label}</div>
      <div className="menu-tiles">{children}</div>
    </div>
  )
}

function Tile({ no, img, title, desc, onClick, badge, violet }: { no: string; img: string; title: string; desc: string; onClick: () => void; badge?: string; violet?: boolean }) {
  return (
    <button className={`tile ${violet ? 'violet' : ''}`} onClick={onClick}>
      <img className="tile-img" src={img} alt="" />
      {badge && <span className="badge tone-warn tile-badge"><span className="dot" />{badge}</span>}
      <div className="tile-body">
        <div className="tile-no">{no}</div>
        <div className="tile-title">{title}<ArrowRight /></div>
        <div className="tile-desc">{desc}</div>
      </div>
    </button>
  )
}
