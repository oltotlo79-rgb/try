// S26 依頼書以外の作業：依頼書を通さずに受けた作業（口頭依頼・定期作業など）を登録し、貢献額の集計に含める
import { useMemo, useState } from 'react'
import { ArrowLeft, Eraser, Hammer, Info, ListChecks, Pencil, Plus, Save, Trash2, X } from 'lucide-react'
import type { RouteOf } from '../../router'
import type { OtherWork } from '../../domain/types'
import { useApp, useMe } from '../../store'
import { Avatar, Badge, Empty, EmployeePicker, Field, PageHead, Panel, ProgressBar } from '../../components/ui'
import { MAX_ASSIGNEES, deptName, equalRatios, findEmployee, isAdmin } from '../../domain/rules'
import { fiscalYearOf, fmtDate, fmtMD, fmtYen, toISODate } from '../../domain/format'
import headImg from '../../assets/img/set_other_works.webp'
import './settings-d.css'

type Form = Omit<OtherWork, 'id' | 'createdBy' | 'createdAt'> & { id?: string }

const PROGRESS_STEPS = Array.from({ length: 11 }, (_, i) => i * 10)

export default function S26OtherWorks({ route }: { route: RouteOf<'S26'> }) {
  void route
  const db = useApp((s) => s.db)
  const go = useApp((s) => s.go)
  const me = useMe()
  const admin = isAdmin(me)
  const blank = (): Form => ({
    requestDate: toISODate(Date.now()),
    deptId: db.departments[0]?.id ?? '',
    requesterName: '',
    assignees: [],
    ratios: [],
    title: '',
    progress: 0,
    completedDate: null,
    contribution: null,
  })
  const [form, setForm] = useState<Form>(blank)
  const [picking, setPicking] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const members = db.employees.filter((e) => e.active && e.roles.equipment)
  const works = useMemo(() => [...db.otherWorks].sort((a, b) => b.requestDate.localeCompare(a.requestDate)), [db.otherWorks])
  const fy = fiscalYearOf(toISODate(Date.now()))
  const fyTotal = db.otherWorks.filter((w) => w.completedDate && fiscalYearOf(w.completedDate) === fy).reduce((s, w) => s + (w.contribution ?? 0), 0)
  const openCount = db.otherWorks.filter((w) => !w.completedDate).length

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))

  const clear = () => {
    setForm(blank())
    setErrors({})
  }

  const loadForEdit = (w: OtherWork) => {
    setForm({
      id: w.id, requestDate: w.requestDate, deptId: w.deptId, requesterName: w.requesterName, assignees: [...w.assignees],
      ratios: [...w.ratios], title: w.title, progress: w.progress, completedDate: w.completedDate, contribution: w.contribution,
    })
    setErrors({})
  }

  const save = () => {
    const e: Record<string, string> = {}
    if (!form.requestDate) e.requestDate = '入力してください'
    if (!form.deptId) e.deptId = '選んでください'
    if (!form.requesterName.trim()) e.requesterName = '選んでください'
    if (!form.assignees.length) e.assignee = '担当者を選んでください'
    if (!form.title.trim()) e.title = '入力してください'
    if (form.assignees.length >= 2 && form.ratios.reduce((a, b) => a + b, 0) !== 100) e.ratio = '配分の合計が100％になるように入力してください'
    setErrors(e)
    if (Object.keys(e).length) return
    const ok = useApp.getState().upsertOtherWork({
      ...form,
      ratios: form.assignees.length === 1 ? [100] : form.ratios,
      progress: form.completedDate ? 100 : form.progress,
    })
    if (ok) clear()
  }

  const remove = async (w: OtherWork) => {
    const ok = await useApp.getState().ask({
      title: '作業を削除しますか？',
      body: `「${w.title}」を削除します。成果確認の集計からも外れます。`,
      okLabel: '削除する',
      tone: 'danger',
    })
    if (ok) {
      useApp.getState().deleteOtherWork(w.id)
      if (form.id === w.id) clear()
    }
  }

  const names = (w: OtherWork) =>
    w.assignees
      .map((id, i) => {
        const e = findEmployee(db, id)
        if (!e) return null
        const ratio = w.assignees.length >= 2 ? (w.ratios[i] ?? null) : null
        return `${e.name.split(/[\s　]/)[0]}${ratio !== null ? ` ${ratio}%` : ''}`
      })
      .filter(Boolean)
      .join('・')

  return (
    <div className="page wide">
      <div className="sd-head">
        <img className="sd-head-img" src={headImg} alt="" />
        <PageHead
          sid="S26"
          en="OTHER WORKS"
          title="依頼書以外の作業"
          desc="依頼書を通さずに受けた作業（口頭依頼・定期作業など）を登録し、貢献額の集計に含めます。"
          actions={
            <button className="btn" onClick={() => go({ s: 'S21' })}>
              <ArrowLeft /> 設定メニューへ
            </button>
          }
        />
      </div>

      <div className="sd-stats">
        <div className="stat">
          <div className="stat-label"><ListChecks /> 登録済みの作業</div>
          <div className="stat-value">{db.otherWorks.length}<small>件</small></div>
        </div>
        <div className="stat" style={{ ['--glow' as string]: 'rgba(255,181,71,.2)' }}>
          <div className="stat-label"><Hammer /> 対応中（完了日が未入力）</div>
          <div className="stat-value">{openCount}<small>件</small></div>
        </div>
        <div className="stat" style={{ ['--glow' as string]: 'rgba(155,140,255,.22)' }}>
          <div className="stat-label">{fy}年度に完了した作業の貢献額</div>
          <div className="stat-value">{fmtYen(fyTotal)}<small>円</small></div>
        </div>
      </div>

      <div className="grid-main-side" style={{ gridTemplateColumns: 'minmax(0,1fr) 440px' }}>
        <Panel title="登録済みの作業" icon={<ListChecks />} sub="「編集」で右の欄に読み込みます" tight>
          {works.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>依頼日</th>
                    <th>依頼部署</th>
                    <th>担当者</th>
                    <th>作業内容</th>
                    <th style={{ width: 130 }}>進捗</th>
                    <th>完了日</th>
                    <th className="r">貢献額</th>
                    <th className="r">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {works.map((w) => (
                    <tr key={w.id} className={form.id === w.id ? 'sd-sel' : ''}>
                      <td className="mono small">{fmtMD(w.requestDate)}</td>
                      <td className="nowrap">{deptName(db, w.deptId)}</td>
                      <td className="nowrap">{names(w)}</td>
                      <td style={{ minWidth: 170 }}>
                        <div>{w.title}</div>
                        <div className="tiny tx-3">依頼者：{w.requesterName}</div>
                      </td>
                      <td><ProgressBar value={w.progress} /></td>
                      <td className="mono small">{w.completedDate ? fmtMD(w.completedDate) : <Badge tone="info" sm>対応中</Badge>}</td>
                      <td className="r mono">{fmtYen(w.contribution)}</td>
                      <td className="r">
                        <div className="row end gap-4">
                          <button className="btn btn-sm btn-icon" title="編集" onClick={() => loadForEdit(w)}><Pencil /></button>
                          <button className="btn btn-sm btn-ghost btn-icon" title="削除" onClick={() => remove(w)}><Trash2 /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="登録された作業はありません" desc="右の欄から登録してください" />
          )}
        </Panel>

        <Panel
          glow
          title={form.id ? '作業を編集' : '新規登録'}
          icon={form.id ? <Pencil /> : <Plus />}
          sub={form.id ? `登録日 ${fmtDate(db.otherWorks.find((w) => w.id === form.id)?.createdAt)}` : '＊は必ず入力する項目です'}
          foot={
            <>
              <button className="btn btn-ghost" onClick={clear}><Eraser /> クリア</button>
              <span className="grow" />
              <button className="btn btn-primary" onClick={save}><Save /> {form.id ? '保存' : '登録'}</button>
            </>
          }
        >
          <div className="col gap-16">
            <div className="grid-2" style={{ gap: 14 }}>
              <Field label="依頼日" required error={errors.requestDate}>
                <input type="date" className={`input ${errors.requestDate ? 'invalid' : ''}`} value={form.requestDate} onChange={(e) => set('requestDate', e.target.value)} />
              </Field>
              <Field label="依頼部署" required error={errors.deptId}>
                <select className="select" value={form.deptId} onChange={(e) => set('deptId', e.target.value)}>
                  {db.departments.filter((d) => d.active).map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="依頼者" required error={errors.requesterName} hint="社員データから選びます（依頼部署も合わせて入ります）">
              <div className={`sd-person ${form.requesterName ? '' : 'empty'}`} style={{ minHeight: 48, padding: '6px 10px' }}>
                {form.requesterName ? (
                  <>
                    <Avatar name={form.requesterName} size="sm" color="var(--role-requester)" />
                    <span className="grow">{form.requesterName}</span>
                  </>
                ) : (
                  <span className="grow small">まだ選ばれていません</span>
                )}
                <button className="btn btn-sm" onClick={() => setPicking(true)}>選ぶ</button>
              </div>
            </Field>
            <Field label={`担当者（${MAX_ASSIGNEES}人まで）`} required error={errors.assignee || errors.ratio}>
              <div className="col gap-6">
                {form.assignees.map((id, i) => (
                  <div key={id} className="row gap-6">
                    <Avatar emp={findEmployee(db, id)} size="sm" />
                    <span className="grow small">{findEmployee(db, id)?.name}</span>
                    {form.assignees.length >= 2 && (
                      <>
                        <input type="number" min={0} max={100} step={5} className="input mono" style={{ width: 76, height: 32 }} value={form.ratios[i] ?? 0}
                          onChange={(e) => {
                            const next = [...form.ratios]
                            next[i] = Math.max(0, Math.min(100, Number(e.target.value) || 0))
                            set('ratios', next)
                          }} />
                        <span className="small tx-2">％</span>
                      </>
                    )}
                    <button className="btn btn-icon btn-ghost btn-sm" title="担当から外す" onClick={() => {
                      const next = form.assignees.filter((x) => x !== id)
                      setForm((f) => ({ ...f, assignees: next, ratios: equalRatios(next.length) }))
                    }}>
                      <X />
                    </button>
                  </div>
                ))}
                {form.assignees.length < MAX_ASSIGNEES && (
                  <select className={`select ${errors.assignee ? 'invalid' : ''}`} value="" onChange={(e) => {
                    if (!e.target.value) return
                    const next = [...form.assignees, e.target.value]
                    setForm((f) => ({ ...f, assignees: next, ratios: equalRatios(next.length) }))
                  }}>
                    <option value="">{form.assignees.length ? '＋ 担当者を追加' : '担当者を選ぶ'}</option>
                    {members.filter((m) => !form.assignees.includes(m.id)).map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                )}
                {form.assignees.length >= 2 && (
                  <div className="row between small">
                    <span className={form.ratios.reduce((a, b) => a + b, 0) === 100 ? 'tx-ok mono' : 'tx-danger mono'}>配分の合計 {form.ratios.reduce((a, b) => a + b, 0)}%</span>
                    <button className="btn btn-sm btn-ghost" onClick={() => set('ratios', equalRatios(form.assignees.length))}>均等に分ける</button>
                  </div>
                )}
              </div>
            </Field>
            <Field label="作業内容" required error={errors.title}>
              <input className={`input ${errors.title ? 'invalid' : ''}`} placeholder="例）金型の定期点検" value={form.title} onChange={(e) => set('title', e.target.value)} />
            </Field>
            <div className="grid-2" style={{ gap: 14 }}>
              <Field label="作業進捗" hint="担当者本人も作業進捗（S16）から更新できます">
                <select className="select" value={form.progress} onChange={(e) => set('progress', Number(e.target.value))}>
                  {PROGRESS_STEPS.map((p) => (
                    <option key={p} value={p}>{p} ％</option>
                  ))}
                </select>
              </Field>
              <Field label="完了日" hint="成果確認の集計の基準日になります">
                <input type="date" className="input" value={form.completedDate ?? ''} onChange={(e) => set('completedDate', e.target.value || null)} />
              </Field>
            </div>
            <Field label="貢献額（円）" hint={admin ? 'この作業による貢献額。担当者2人のときは配分で分けて計上します' : '貢献額は管理者・IT担当者だけが入力できます'}>
              <div className="row">
                <input
                  type="number"
                  min={0}
                  step={1000}
                  className="input mono"
                  style={{ textAlign: 'right' }}
                  placeholder="0"
                  disabled={!admin}
                  value={form.contribution ?? ''}
                  onChange={(e) => set('contribution', e.target.value === '' ? null : Math.max(0, Math.round(Number(e.target.value))))}
                />
                <span className="tx-2">円</span>
              </div>
            </Field>
          </div>
        </Panel>
      </div>

      <div className="notice info mt-24">
        <Info />
        <span>設備メンバーは、作業進捗（S16）から自分が担当の作業の進捗と完了日を更新できます。登録・貢献額の入力は管理者・IT担当者が行います。</span>
      </div>

      {picking && (
        <EmployeePicker
          title="依頼者を選ぶ"
          initialDeptId={form.deptId || undefined}
          onClose={() => setPicking(false)}
          onPick={(e) => {
            setForm((f) => ({ ...f, requesterName: e.name, deptId: e.deptId }))
            setErrors((x) => ({ ...x, requesterName: '' }))
            setPicking(false)
          }}
        />
      )}
    </div>
  )
}
