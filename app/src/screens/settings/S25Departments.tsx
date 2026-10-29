// S25 部署・回覧者の設定：部署ごとに回覧者1〜3（組長・工長・課長など）を設定する
import { useEffect, useState } from 'react'
import { AlertTriangle, ArrowLeft, Building2, Info, Pencil, Save, UserCheck, X } from 'lucide-react'
import type { RouteOf } from '../../router'
import type { Employee } from '../../domain/types'
import { useApp } from '../../store'
import { Avatar, Badge, EmployeePicker, PageHead, Panel } from '../../components/ui'
import { findEmployee } from '../../domain/rules'
import headImg from '../../assets/img/set_departments.webp'
import './settings-d.css'

type Slots = [string | null, string | null, string | null]
const SLOT_HINT = ['例：組長。最初に承認依頼メールが届きます', '例：工長。いない部署は空欄（飛ばす）', '例：課長']

function PersonCell({ emp }: { emp: Employee | undefined }) {
  if (!emp) return <span className="tx-3">（なし）</span>
  return (
    <div className="row gap-6">
      <span>{emp.name}</span>
      <span className="tx-3 small">（{emp.position || '—'}）</span>
      {!emp.active && <Badge tone="warn" sm><AlertTriangle size={11} /> 無効</Badge>}
    </div>
  )
}

export default function S25Departments({ route }: { route: RouteOf<'S25'> }) {
  void route
  const db = useApp((s) => s.db)
  const go = useApp((s) => s.go)
  const depts = db.departments.filter((d) => d.active)
  const [deptId, setDeptId] = useState<string>(depts[0]?.id ?? '')
  const dept = db.departments.find((d) => d.id === deptId)
  const [slots, setSlots] = useState<Slots>(dept ? [...dept.reviewers] as Slots : [null, null, null])
  const [picking, setPicking] = useState<number | null>(null)

  useEffect(() => {
    const d = db.departments.find((x) => x.id === deptId)
    if (d) setSlots([...d.reviewers] as Slots)
    // 部署を切り替えたときだけ読み込み直す（編集中の内容は保存するまで残す）
  }, [deptId]) // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = !!dept && slots.some((s, i) => s !== dept.reviewers[i])
  const memberCount = (id: string) => db.employees.filter((e) => e.active && e.deptId === id).length

  const save = () => {
    if (!dept) return
    useApp.getState().setDeptReviewers(dept.id, slots)
  }

  return (
    <div className="page">
      <div className="sd-head">
        <img className="sd-head-img" src={headImg} alt="" />
        <PageHead
          sid="S25"
          en="DEPARTMENTS & REVIEWERS"
          title="部署・回覧者の設定"
          desc="部署ごとに回覧者1〜3を設定します。依頼者が「回覧者の入力」を開くと、自分の部署の回覧者が自動で入ります。"
          actions={
            <button className="btn" onClick={() => go({ s: 'S21' })}>
              <ArrowLeft /> 設定メニューへ
            </button>
          }
        />
      </div>

      <div className="grid-main-side">
        <Panel title="部署の一覧" icon={<Building2 />} sub="部署は社員データ（CSV）の取り込みで自動で作られます" tight>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>部署名</th>
                  <th>回覧者1</th>
                  <th>回覧者2</th>
                  <th>回覧者3</th>
                  <th className="r">操作</th>
                </tr>
              </thead>
              <tbody>
                {depts.map((d) => (
                  <tr key={d.id} className={`click ${d.id === deptId ? 'sd-sel' : ''}`} onClick={() => setDeptId(d.id)}>
                    <td>
                      <div>{d.name}</div>
                      <div className="mono tiny tx-3">{d.code}・{memberCount(d.id)}名</div>
                    </td>
                    {d.reviewers.map((id, i) => (
                      <td key={i}><PersonCell emp={findEmployee(db, id)} /></td>
                    ))}
                    <td className="r">
                      <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); setDeptId(d.id) }}>
                        <Pencil /> 編集
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        {dept && (
          <Panel
            glow
            title={`編集（${dept.name}）`}
            icon={<UserCheck />}
            sub="この順番で承認依頼メールが回ります（空欄は飛ばす）"
            foot={
              <>
                {dirty && <span className="small tx-warn">保存していない変更があります</span>}
                <span className="grow" />
                <button className="btn btn-ghost" disabled={!dirty} onClick={() => setSlots([...dept.reviewers] as Slots)}>元に戻す</button>
                <button className="btn btn-primary" onClick={save} disabled={!dirty}>
                  <Save /> 保存
                </button>
              </>
            }
          >
            <div className="col gap-16">
              {slots.map((id, i) => {
                const e = findEmployee(db, id)
                return (
                  <div key={i} className="col gap-6">
                    <div className="row between">
                      <span className="sd-slot-label">回覧者{i + 1}</span>
                      <span className="hint">{SLOT_HINT[i]}</span>
                    </div>
                    <div className={`sd-person ${e ? '' : 'empty'}`}>
                      {e ? (
                        <>
                          <Avatar emp={e} size="sm" color="var(--role-approver)" />
                          <div className="grow">
                            <b>{e.name}</b>
                            <small>{e.position || '役職なし'}・{e.email}</small>
                          </div>
                          <button className="btn btn-sm btn-ghost btn-icon" title="空欄にする" onClick={() => setSlots(slots.map((x, k) => (k === i ? null : x)) as Slots)}>
                            <X />
                          </button>
                        </>
                      ) : (
                        <span className="grow small">（なし）— 空欄の回覧者は飛ばします</span>
                      )}
                      <button className="btn btn-sm" onClick={() => setPicking(i)}>選ぶ</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </Panel>
        )}
      </div>

      <div className="col gap-6 mt-24">
        <div className="notice info">
          <Info />
          <span>依頼者が回覧者の入力（S07）を開くと、自分の部署の回覧者が自動で入ります（依頼者が変更できます）。</span>
        </div>
        <div className="notice violet">
          <AlertTriangle />
          <span>回覧者が異動・退職で社員データから外れたときは、その部署の回覧者欄を空欄にし、メニューのお知らせで管理者に知らせます。</span>
        </div>
      </div>

      {picking !== null && dept && (
        <EmployeePicker
          title={`回覧者${picking + 1}を選ぶ（${dept.name}）`}
          initialDeptId={dept.id}
          exclude={slots.filter((x, k): x is string => !!x && k !== picking)}
          onClose={() => setPicking(null)}
          onPick={(e) => {
            setSlots(slots.map((x, k) => (k === picking ? e.id : x)) as Slots)
            setPicking(null)
          }}
        />
      )}
    </div>
  )
}
