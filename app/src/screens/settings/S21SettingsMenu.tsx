// S21 設定メニュー：各種設定画面への入口（管理者・IT担当者）
import { ArrowRight, Home, ShieldAlert } from 'lucide-react'
import type { RouteOf, Route } from '../../router'
import { useApp, useMe } from '../../store'
import { findEmployee, isAdmin, pendingStep } from '../../domain/rules'
import { elapsedDays, fmtDateTime } from '../../domain/format'
import { Badge, Empty, PageHead, Panel } from '../../components/ui'
import imgUsers from '../../assets/img/set_users.webp'
import imgImport from '../../assets/img/set_import.webp'
import imgCirculation from '../../assets/img/set_circulation.webp'
import imgDepartments from '../../assets/img/set_departments.webp'
import imgOtherWorks from '../../assets/img/set_other_works.webp'
import imgManage from '../../assets/img/set_manage.webp'
import './settings-c.css'

interface TileDef {
  sid: string
  title: string
  desc: string
  img: string
  to: Route
  path: string
  alerts: { tone: string; text: string }[]
}

export default function S21SettingsMenu({ route }: { route: RouteOf<'S21'> }) {
  void route
  const me = useMe()!
  const db = useApp((s) => s.db)
  const go = useApp((s) => s.go)
  const now = Date.now()

  if (!isAdmin(me)) {
    return (
      <div className="page">
        <PageHead sid="S21" en="SETTINGS" title="設定メニュー" />
        <Panel><Empty title="この画面は管理者・IT担当者だけが使えます" /></Panel>
      </div>
    )
  }

  const stalled = db.requests.filter((r) => {
    const p = r.status === 'circulating' ? pendingStep(r) : undefined
    return p?.sentAt && elapsedDays(p.sentAt, now) >= 3
  }).length
  const inactiveTargets = db.targets.filter((t) => !findEmployee(db, t.employeeId)?.active).length
  const activeTargets = db.targets.filter((t) => t.active).length
  const emptyDepts = db.departments.filter((d) => {
    const hasMembers = db.employees.some((e) => e.active && e.deptId === d.id && !e.roles.equipment)
    return d.active && hasMembers && d.reviewers.every((x) => !x)
  }).length
  const lockedUsers = db.employees.filter((e) => e.lockedUntil && e.lockedUntil > now).length
  const firstLogin = db.employees.filter((e) => e.active && e.roles.equipment && !e.passwordChanged).length
  const lastImport = db.importLogs[0]
  const activeOther = db.otherWorks.filter((w) => !w.completedDate).length

  const tiles: TileDef[] = [
    {
      sid: 'S22', title: 'ユーザー管理', desc: '設備メンバー・リーダー・管理者・IT担当者の権限を付ける。パスワードを初期化する。',
      img: imgUsers, to: { s: 'S22' }, path: '/settings/users',
      alerts: [
        ...(lockedUsers ? [{ tone: 'danger', text: `ロック中 ${lockedUsers}人` }] : []),
        ...(firstLogin ? [{ tone: 'violet', text: `初回ログイン前 ${firstLogin}人` }] : []),
      ],
    },
    {
      sid: 'S23', title: '社員データの取り込み', desc: '全社員の所属・役職・メールアドレスをCSVで最新の状態にする。',
      img: imgImport, to: { s: 'S23' }, path: '/settings/employees',
      alerts: lastImport ? [{ tone: 'muted', text: `前回 ${fmtDateTime(lastImport.at).slice(5)}` }] : [],
    },
    {
      sid: 'S24', title: '回覧先の設定', desc: '回覧者の後に毎回固定で回る回覧先と、その順番を設定する。',
      img: imgCirculation, to: { s: 'S24' }, path: '/settings/circulation',
      alerts: [
        ...(inactiveTargets ? [{ tone: 'danger', text: `無効になった回覧先 ${inactiveTargets}人` }] : []),
        { tone: 'muted', text: `有効な回覧先 ${activeTargets}人` },
      ],
    },
    {
      sid: 'S25', title: '部署・回覧者の設定', desc: '部署ごとの回覧者1〜3（組長・工長・課長など）を設定する。',
      img: imgDepartments, to: { s: 'S25' }, path: '/settings/departments',
      alerts: emptyDepts ? [{ tone: 'warn', text: `回覧者が未設定の部署 ${emptyDepts}` }] : [],
    },
    {
      sid: 'S26', title: '依頼書以外の作業', desc: '口頭依頼・定期作業など、依頼書を通さない作業を登録する。',
      img: imgOtherWorks, to: { s: 'S26' }, path: '/settings/other-works',
      alerts: activeOther ? [{ tone: 'info', text: `対応中 ${activeOther}件` }] : [],
    },
    {
      sid: 'S27', title: '依頼書の管理・代理承認', desc: '依頼書の編集、止まっている承認の代理承認、承認依頼メールの再送。',
      img: imgManage, to: { s: 'S27' }, path: '/settings/requests',
      alerts: stalled ? [{ tone: 'danger', text: `承認が3日以上止まっている依頼 ${stalled}件` }] : [],
    },
  ]

  return (
    <div className="page">
      <PageHead
        sid="S21"
        en="SETTINGS"
        title="設定メニュー"
        desc="ユーザー・社員データ・回覧先などの設定と、依頼書の管理を行います。"
        actions={<button className="btn" onClick={() => go({ s: 'S04' })}><Home /> メニューへ</button>}
      />

      <div className="set-banner">
        <ShieldAlert />
        <span className="grow">
          この画面は<b>管理者・IT担当者</b>だけが使えます。設定の変更・代理承認は「誰が・いつ・何を」したかが記録に残ります。
        </span>
        {stalled > 0 && (
          <button className="btn btn-sm btn-danger" onClick={() => go({ s: 'S27' })}>止まっている依頼を確認 <ArrowRight /></button>
        )}
      </div>

      <div className="set-tiles">
        {tiles.map((t) => (
          <button key={t.sid} className="tile violet" onClick={() => go(t.to)}>
            <img className="tile-img" src={t.img} alt="" />
            {t.alerts.length > 0 && (
              <div className="tile-alerts">
                {t.alerts.map((a) => (
                  <Badge key={a.text} tone={a.tone} dot={a.tone === 'danger'} sm>{a.text}</Badge>
                ))}
              </div>
            )}
            <div className="tile-body">
              <div className="tile-no">{t.sid}</div>
              <div className="tile-title">{t.title}<ArrowRight /></div>
              <div className="tile-desc">{t.desc}</div>
              <div className="tile-path">{t.path}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
