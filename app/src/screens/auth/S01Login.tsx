// S01 ログイン：従業員番号を入力する。一般の社員はそのままメニュー、設備メンバーはパスワード入力へ
import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Info, KeyRound, MailOpen } from 'lucide-react'
import type { RouteOf } from '../../router'
import { useApp } from '../../store'
import { Avatar, Field } from '../../components/ui'
import { AuthLayout } from './AuthLayout'
import { DEMO_PASSWORD } from '../../data/seed'

const DEMO: [empNo: string, role: string, tone: string][] = [
  ['20101', '依頼者', 'role-requester'],
  ['20215', '依頼者', 'role-requester'],
  ['10123', '設備リーダー', 'role-equipment'],
  ['10245', '設備メンバー', 'role-equipment'],
  ['10050', '管理者', 'role-admin'],
  ['10310', 'IT担当者', 'role-admin'],
  ['10501', '初回ログイン', 'role-equipment'],
]

export default function S01Login({ route }: { route: RouteOf<'S01'> }) {
  const db = useApp((s) => s.db)
  const prefill = useApp((s) => s.loginPrefill)
  const afterLogin = useApp((s) => s.afterLogin)
  const loginStep1 = useApp((s) => s.loginStep1)
  const [empNo, setEmpNo] = useState(prefill ?? '')
  const [err, setErr] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => input.current?.focus(), [])

  const submit = (no = empNo) => {
    const e = loginStep1(no)
    setErr(e)
  }

  return (
    <AuthLayout route={route} sid="S01">
      <h2 className="auth-title">ログイン</h2>
      <p className="auth-lead">従業員番号を入力してください。一般の社員はパスワード不要です。</p>
      {afterLogin && (
        <div className="notice info" style={{ marginBottom: 16 }}>
          <MailOpen />
          <span>メールのURLから開きました。ログインすると、該当の画面を表示します。</span>
        </div>
      )}
      <form onSubmit={(e) => { e.preventDefault(); submit() }}>
        <Field label="従業員番号" required error={err}>
          <input
            ref={input}
            className={`input auth-input ${err ? 'invalid' : ''}`}
            inputMode="numeric"
            placeholder="12345"
            value={empNo}
            maxLength={5}
            onChange={(e) => { setEmpNo(e.target.value.replace(/[^\d０-９]/g, '').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))); setErr(null) }}
          />
        </Field>
        <button type="submit" className="btn btn-primary btn-lg btn-block mt-16">
          次へ <ArrowRight />
        </button>
      </form>
      <div className="row tx-3 small mt-12 gap-6">
        <Info size={14} /> 60分操作がないと自動でログアウトします。
      </div>

      <div className="demo-accounts">
        <div className="section-label">デモ用アカウント（クリックでログイン）</div>
        <div className="demo-grid">
          {DEMO.map(([no, role, tone]) => {
            const e = db.employees.find((x) => x.empNo === no)!
            return (
              <button key={no} className="demo-card" onClick={() => { setEmpNo(no); submit(no) }}>
                <Avatar emp={e} size="sm" />
                <div className="grow">
                  <b>{e.name}</b>
                  <small>
                    <span className={`role-tag ${tone}`}>{role}</span>
                    <span className="mono">{no}</span>
                  </small>
                </div>
                {e.roles.equipment && <KeyRound size={14} className="tx-3" />}
              </button>
            )
          })}
        </div>
        <p className="hint mt-8">
          設備メンバーのパスワードは <span className="mono tx-cyan">{DEMO_PASSWORD}</span>（初回ログインの渡辺 六郎は従業員番号）。
          承認者（課長・回覧先など）はログインせず、メールBOXのURLから承認します。
        </p>
      </div>
    </AuthLayout>
  )
}
