// S22 ユーザー管理：社員データから取り込んだ社員に権限を付ける。設備メンバーのパスワードを初期化する
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, KeyRound, Lock, Pencil, RotateCcw, Save, Search, ShieldCheck, UserCog } from 'lucide-react'
import type { RouteOf } from '../../router'
import type { Employee, Roles } from '../../domain/types'
import { useApp, useMe } from '../../store'
import { deptName, isAdmin } from '../../domain/rules'
import { fmtDateTime } from '../../domain/format'
import { Avatar, Badge, Empty, PageHead, Panel, RoleTags } from '../../components/ui'
import './settings-c.css'

const PERMS: { key: keyof Roles; label: string; desc: string }[] = [
  { key: 'equipment', label: '設備メンバー', desc: '依頼書一覧・進捗更新・成果確認。付けるとパスワードでのログインになる' },
  { key: 'leader', label: 'リーダー', desc: '担当者の割り当て、打ち合わせ・貢献額の入力' },
  { key: 'manager', label: '管理者', desc: 'リーダーの操作に加えて、各種設定・代理承認' },
  { key: 'it', label: 'IT担当者', desc: '管理者と同じ操作に加えて、問い合わせへの回答' },
]

const hasAnyRole = (e: Employee) => e.roles.equipment || e.roles.leader || e.roles.manager || e.roles.it

export default function S22Users({ route }: { route: RouteOf<'S22'> }) {
  void route
  const me = useMe()!
  const db = useApp((s) => s.db)
  const go = useApp((s) => s.go)
  const ask = useApp((s) => s.ask)
  const setRoles = useApp((s) => s.setRoles)
  const resetPassword = useApp((s) => s.resetPassword)
  const [q, setQ] = useState('')
  const [onlyRoles, setOnlyRoles] = useState(true)
  const [applied, setApplied] = useState({ q: '', onlyRoles: true })
  const [selId, setSelId] = useState<string | null>('10501')
  const sel = db.employees.find((e) => e.id === selId) ?? null
  const [roles, setRolesDraft] = useState<Roles | null>(sel?.roles ?? null)

  useEffect(() => {
    setRolesDraft(sel ? { ...sel.roles } : null)
  }, [selId]) // eslint-disable-line react-hooks/exhaustive-deps

  const list = useMemo(() => {
    const k = applied.q.trim()
    return db.employees
      .filter((e) => (!applied.onlyRoles || hasAnyRole(e)) && (!k || e.name.includes(k) || e.kana.includes(k) || e.empNo.includes(k) || deptName(db, e.deptId).includes(k)))
      .sort((a, b) => Number(b.active) - Number(a.active) || a.empNo.localeCompare(b.empNo))
  }, [db, applied])

  if (!isAdmin(me)) {
    return (
      <div className="page">
        <PageHead sid="S22" en="USERS" title="ユーザー管理" />
        <Panel><Empty title="この画面は管理者・IT担当者だけが使えます" /></Panel>
      </div>
    )
  }

  const now = Date.now()
  const isSelf = sel?.id === me.id
  const dirty = !!sel && !!roles && PERMS.some((p) => sel.roles[p.key] !== roles[p.key])
  const lockSelf = (k: keyof Roles) => isSelf && (k === 'manager' || k === 'it') && !!sel?.roles[k]

  const pwState = (e: Employee) => {
    if (!e.roles.equipment && !e.password) return { tone: 'muted', icon: <KeyRound />, text: 'パスワード不要（従業員番号だけでログイン）' }
    if (e.lockedUntil && e.lockedUntil > now) return { tone: 'danger', icon: <Lock />, text: `ロック中（${fmtDateTime(e.lockedUntil).slice(11)} まで）` }
    if (!e.passwordChanged) return { tone: 'warn', icon: <KeyRound />, text: '未設定（初回ログイン前・パスワード＝従業員番号）' }
    return { tone: 'ok', icon: <ShieldCheck />, text: '設定済み' }
  }

  const save = async () => {
    if (!sel || !roles) return
    if (roles.equipment && !sel.roles.equipment) {
      const ok = await ask({
        title: '設備メンバー権限を付けますか？',
        body: `${sel.name} さんは次回から従業員番号とパスワードでログインします。\n初めてのパスワードは従業員番号（${sel.empNo}）です。`,
        okLabel: '付けて保存',
      })
      if (!ok) return
    }
    setRoles(sel.id, roles)
  }

  const reset = async () => {
    if (!sel) return
    const ok = await ask({
      title: 'パスワードを初期化しますか？',
      body: `${sel.name} さんのパスワードを従業員番号（${sel.empNo}）に戻します。\n本人は次回ログイン時に新しいパスワードを設定します。`,
      okLabel: '初期化する',
      tone: 'warn',
    })
    if (ok) resetPassword(sel.id)
  }

  return (
    <div className="page wide">
      <PageHead
        sid="S22"
        en="USER MANAGEMENT"
        title="ユーザー管理"
        desc="社員データから取り込んだ社員に、設備メンバー・リーダー・管理者・IT担当者の権限を付けます。権限は重ねて付けられます。"
        actions={<button className="btn" onClick={() => go({ s: 'S21' })}><ArrowLeft /> 設定メニューへ</button>}
      />

      <div className="user-grid">
        <div className="col gap-16">
          <Panel>
            <div className="row gap-16">
              <input
                className="input grow"
                placeholder="部署・氏名・従業員番号で探す"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && setApplied({ q, onlyRoles })}
              />
              <label className="check nowrap">
                <input type="checkbox" checked={onlyRoles} onChange={(e) => { setOnlyRoles(e.target.checked); setApplied({ q, onlyRoles: e.target.checked }) }} />
                権限がある人だけ
              </label>
              <button className="btn btn-primary" onClick={() => setApplied({ q, onlyRoles })}><Search /> 検索</button>
            </div>
          </Panel>

          <Panel tight title="ユーザーの一覧" sub="「編集」で右の欄に読み込みます" actions={<span className="small tx-3"><span className="mono tx-1">{list.length}</span> 人</span>}>
            <div className="table-wrap" style={{ maxHeight: 'calc(100vh - 380px)' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 110 }}>従業員番号</th>
                    <th>氏名</th>
                    <th>部署</th>
                    <th>権限</th>
                    <th>状態</th>
                    <th className="r">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((e) => (
                    <tr key={e.id} className={`click ${e.id === selId ? 'sel' : ''} ${e.active ? '' : 'muted'}`} onClick={() => setSelId(e.id)}>
                      <td className="id-cell">{e.empNo}</td>
                      <td>
                        <span className="row gap-6">
                          <Avatar emp={e} size="sm" />
                          {e.name}
                          {e.id === me.id && <Badge tone="violet" sm>あなた</Badge>}
                        </span>
                      </td>
                      <td>{deptName(db, e.deptId)}</td>
                      <td><RoleTags emp={e} /></td>
                      <td>{e.active ? <Badge tone="ok" sm dot>有効</Badge> : <Badge tone="muted" sm>無効（退職）</Badge>}</td>
                      <td className="r">
                        <button className="btn btn-sm" onClick={(ev) => { ev.stopPropagation(); setSelId(e.id) }}><Pencil /> 編集</button>
                      </td>
                    </tr>
                  ))}
                  {!list.length && (
                    <tr><td colSpan={6}><Empty title="条件に合う社員がいません" /></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <div className="edit-card">
          <Panel glow title={sel ? `権限の設定（選択中：${sel.name}）` : '権限の設定'} icon={<UserCog />}>
            {!sel || !roles ? (
              <Empty title="左の一覧から社員を選んでください" />
            ) : (
              <div className="col gap-16">
                <div>
                  <div className="section-label">社員データ</div>
                  <div className="row gap-16">
                    <Avatar emp={sel} size="lg" />
                    <div className="grow">
                      <b style={{ fontSize: 15 }}>{sel.name}</b>
                      <span className="tiny tx-3" style={{ marginLeft: 8 }}>{sel.kana}</span>
                      <div className="small tx-2"><span className="mono">{sel.empNo}</span>　{deptName(db, sel.deptId)}　{sel.position}</div>
                      <div className="mono tiny tx-3">{sel.email}</div>
                    </div>
                  </div>
                  <p className="hint mt-8">氏名・部署・メールアドレスは社員データ（CSV）の内容です。この画面では変更しません。</p>
                </div>

                <div>
                  <div className="section-label">権限</div>
                  <div className="perm-list">
                    {PERMS.map((p) => {
                      const locked = lockSelf(p.key) || !sel.active
                      return (
                        <label key={p.key} className={`perm ${roles[p.key] ? 'on' : ''} ${locked ? 'disabled' : ''}`}>
                          <span className="check">
                            <input
                              type="checkbox"
                              checked={roles[p.key]}
                              disabled={locked}
                              onChange={(e) => setRolesDraft({ ...roles, [p.key]: e.target.checked })}
                            />
                          </span>
                          <span>
                            <b>{p.label}</b>
                            <small>{lockSelf(p.key) ? '自分自身の管理者・IT担当者権限は外せません' : p.desc}</small>
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <div className="section-label">パスワード</div>
                  {(() => {
                    const st = pwState(sel)
                    return (
                      <div className={`pw-state tone-${st.tone}`} style={{ background: undefined }}>
                        {st.icon}
                        <span>{st.text}</span>
                      </div>
                    )
                  })()}
                  <p className="hint mt-8">パスワードそのものは誰にも見えません（元に戻せない形で保存）。</p>
                </div>

                {!sel.active && <div className="notice warn">この社員は社員データで無効（退職など）のため、ログインできません。</div>}

                <div className="row gap-6 mt-4">
                  <button className="btn btn-warn" disabled={!sel.roles.equipment || !sel.active} onClick={reset}>
                    <RotateCcw /> パスワード初期化
                  </button>
                  <span className="grow" />
                  <button className="btn btn-violet" disabled={!dirty} onClick={save}><Save /> 保存</button>
                </div>
                <p className="hint">権限とパスワードは、社員データを取り込み直しても変わりません。</p>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}
