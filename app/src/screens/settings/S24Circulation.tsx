// S24 回覧先の設定：依頼部署の回覧者の後に、毎回固定で回る「回覧先」と、その順番を設定する
import { Fragment, useMemo, useState } from 'react'
import {
  AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, ChevronRight, Info, Pencil, Plus, Route as RouteIcon, Save, Trash2, UserPlus, Users,
} from 'lucide-react'
import type { RouteOf } from '../../router'
import { useApp } from '../../store'
import { Avatar, Badge, Empty, EmployeePicker, Field, PageHead, Panel } from '../../components/ui'
import { deptName, findEmployee } from '../../domain/rules'
import headImg from '../../assets/img/set_circulation.webp'
import './settings-d.css'

interface Edit {
  id: string | null // null = 新規追加
  employeeId: string | null
  active: boolean
}

const NEW_EDIT: Edit = { id: null, employeeId: null, active: true }

export default function S24Circulation({ route }: { route: RouteOf<'S24'> }) {
  void route
  const db = useApp((s) => s.db)
  const go = useApp((s) => s.go)
  const store = useApp.getState
  const [edit, setEdit] = useState<Edit>(NEW_EDIT)
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const targets = useMemo(() => [...db.targets].sort((a, b) => a.order - b.order), [db.targets])
  const selected = edit.employeeId ? findEmployee(db, edit.employeeId) : undefined

  const startEdit = (id: string) => {
    const t = db.targets.find((x) => x.id === id)
    if (!t) return
    setEdit({ id: t.id, employeeId: t.employeeId, active: t.active })
    setError(null)
  }

  const save = () => {
    if (!edit.employeeId) {
      setError('回覧先にする人を選んでください')
      return
    }
    setError(null)
    const ok = edit.id
      ? store().updateTarget(edit.id, { employeeId: edit.employeeId, active: edit.active })
      : store().addTarget(edit.employeeId, edit.active)
    if (ok) setEdit(NEW_EDIT)
  }

  const remove = async () => {
    if (!edit.id) return
    const name = selected?.name ?? ''
    const ok = await store().ask({
      title: '回覧先を削除しますか？',
      body: `「${name}」を回覧先から削除します。\nすでに回覧中の依頼は、送信した時点の回覧先で回ります。`,
      okLabel: '削除する',
      tone: 'danger',
    })
    if (ok && store().deleteTarget(edit.id)) setEdit(NEW_EDIT)
  }

  const activeTargets = targets.filter((t) => t.active)

  return (
    <div className="page">
      <div className="sd-head">
        <img className="sd-head-img" src={headImg} alt="" />
        <PageHead
          sid="S24"
          en="CIRCULATION TARGETS"
          title="回覧先の設定"
          desc="依頼部署の回覧者（1〜3）の承認後、上から順番に回る回覧先です（すべての依頼で共通）。"
          actions={
            <button className="btn" onClick={() => go({ s: 'S21' })}>
              <ArrowLeft /> 設定メニューへ
            </button>
          }
        />
      </div>

      <Panel title="回覧ルートのプレビュー" icon={<RouteIcon />} sub="新しく送信される依頼は、この順番で承認依頼メールが届きます" className="mt-4">
        <div className="sd-route">
          {[1, 2, 3].map((n) => (
            <Fragment key={`r${n}`}>
              <div className="sd-route-node reviewer">
                <b>回覧者{n}</b>
                <span>依頼部署（依頼者が選ぶ）</span>
              </div>
              <span className="sd-route-arrow"><ChevronRight /></span>
            </Fragment>
          ))}
          {targets.map((t, i) => {
            const e = findEmployee(db, t.employeeId)
            const off = !t.active || !e?.active
            const no = activeTargets.findIndex((x) => x.id === t.id) + 1
            return (
              <Fragment key={t.id}>
                <div className={`sd-route-node target ${off ? 'off' : ''}`} title={off ? '回覧から外れています' : undefined}>
                  <b>{off ? '回覧先（無効）' : `回覧先${no}`}</b>
                  <span>{e ? `${deptName(db, e.deptId)} ${e.name.split(/[\s　]/)[0]}` : '—'}</span>
                </div>
                {i < targets.length - 1 && <span className="sd-route-arrow"><ChevronRight /></span>}
              </Fragment>
            )
          })}
          {!targets.length && <span className="tx-3 small">回覧先が登録されていません</span>}
        </div>
      </Panel>

      <div className="grid-main-side mt-24">
        <Panel
          title="回覧先の一覧"
          icon={<Users />}
          sub="「↑↓」で順番を入れ替え、「編集」で右の欄に読み込みます"
          tight
          actions={
            <button className="btn btn-sm" onClick={() => { setEdit(NEW_EDIT); setError(null) }}>
              <Plus /> 新しく追加
            </button>
          }
        >
          {targets.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 64 }}>順番</th>
                    <th>部署</th>
                    <th>氏名</th>
                    <th>メールアドレス</th>
                    <th>有効</th>
                    <th className="r">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {targets.map((t, i) => {
                    const e = findEmployee(db, t.employeeId)
                    return (
                      <tr key={t.id} className={edit.id === t.id ? 'sd-sel' : ''}>
                        <td><span className="sd-order">{t.order}</span></td>
                        <td>{e ? deptName(db, e.deptId) : '—'}</td>
                        <td>
                          <div className="row">
                            <Avatar emp={e} size="sm" color="var(--role-approver)" />
                            <div>
                              <div>{e?.name ?? '（不明な社員）'}</div>
                              {e && !e.active && (
                                <Badge tone="warn" sm>
                                  <AlertTriangle size={11} /> 社員データで無効
                                </Badge>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="mono small tx-2">{e?.email ?? '—'}</td>
                        <td>{t.active ? <Badge tone="ok" dot sm>有効</Badge> : <Badge tone="muted" dot sm>無効</Badge>}</td>
                        <td className="r">
                          <div className="row end gap-4">
                            <button className="btn btn-sm btn-icon btn-ghost" disabled={i === 0} title="上へ" onClick={() => store().moveTarget(t.id, -1)}>
                              <ArrowUp />
                            </button>
                            <button className="btn btn-sm btn-icon btn-ghost" disabled={i === targets.length - 1} title="下へ" onClick={() => store().moveTarget(t.id, 1)}>
                              <ArrowDown />
                            </button>
                            <button className="btn btn-sm" onClick={() => startEdit(t.id)}>
                              <Pencil /> 編集
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="回覧先が登録されていません" desc="右の欄から回覧先にする人を選んで追加してください" />
          )}
        </Panel>

        <Panel
          glow
          title={edit.id ? '回覧先を編集' : '回覧先を追加'}
          icon={edit.id ? <Pencil /> : <UserPlus />}
          sub={edit.id ? `順番 ${db.targets.find((t) => t.id === edit.id)?.order ?? ''}` : '一覧の最後に追加します'}
          foot={
            <>
              {edit.id && (
                <button className="btn btn-danger" onClick={remove}>
                  <Trash2 /> 削除
                </button>
              )}
              <span className="grow" />
              {edit.id && (
                <button className="btn btn-ghost" onClick={() => { setEdit(NEW_EDIT); setError(null) }}>
                  キャンセル
                </button>
              )}
              <button className="btn btn-primary" onClick={save}>
                <Save /> 保存
              </button>
            </>
          }
        >
          <div className="col gap-20">
            <Field label="回覧先にする人" required error={error} hint="社員データから選びます。部署・氏名・メールアドレスは社員データの内容を使います。">
              <div className={`sd-person ${selected ? '' : 'empty'}`}>
                {selected ? (
                  <>
                    <Avatar emp={selected} color="var(--role-approver)" />
                    <div className="grow">
                      <b>{selected.name}（{deptName(db, selected.deptId)}）</b>
                      <small className="mono">{selected.email}</small>
                    </div>
                  </>
                ) : (
                  <span className="grow small">まだ選ばれていません</span>
                )}
                <button className="btn btn-sm" onClick={() => setPicking(true)}>
                  選ぶ
                </button>
              </div>
            </Field>
            <Field label="有効" hint="一時的に回覧から外すときは「無効」にします。">
              <div className="row gap-20">
                <label className="check">
                  <input type="radio" checked={edit.active} onChange={() => setEdit({ ...edit, active: true })} /> 有効
                </label>
                <label className="check">
                  <input type="radio" checked={!edit.active} onChange={() => setEdit({ ...edit, active: false })} /> 無効
                </label>
              </div>
            </Field>
          </div>
        </Panel>
      </div>

      <div className="col gap-6 mt-24">
        <div className="notice info">
          <Info />
          <span>変更は、これから送信される依頼から反映します。すでに回覧中の依頼は、送信した時点の回覧先で回ります。</span>
        </div>
        <div className="notice violet">
          <AlertTriangle />
          <span>回覧先の人が社員データで「無効」になったときは、メニューのお知らせで管理者に知らせます。</span>
        </div>
      </div>

      {picking && (
        <EmployeePicker
          title="回覧先にする人を選ぶ"
          exclude={db.targets.filter((t) => t.id !== edit.id).map((t) => t.employeeId)}
          onClose={() => setPicking(false)}
          onPick={(e) => {
            setEdit({ ...edit, employeeId: e.id })
            setError(null)
            setPicking(false)
          }}
        />
      )}
    </div>
  )
}
