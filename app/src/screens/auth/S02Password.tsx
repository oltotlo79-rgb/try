// S02 パスワード入力：設備メンバー権限を持つ社員。5回連続で間違えると15分ロック
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Eye, EyeOff, LogIn, Sparkles } from 'lucide-react'
import type { RouteOf } from '../../router'
import { useApp } from '../../store'
import { Avatar, Field, RoleTags } from '../../components/ui'
import { AuthLayout } from './AuthLayout'
import { deptName } from '../../domain/rules'
import { DEMO_PASSWORD } from '../../data/seed'

export default function S02Password({ route }: { route: RouteOf<'S02'> }) {
  const db = useApp((s) => s.db)
  const empNo = useApp((s) => s.loginEmpNo)
  const loginStep2 = useApp((s) => s.loginStep2)
  const go = useApp((s) => s.go)
  const [pw, setPw] = useState('')
  const [show, setShow] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => input.current?.focus(), [])
  const e = db.employees.find((x) => x.empNo === empNo)
  if (!e) return null
  const first = !e.passwordChanged

  return (
    <AuthLayout route={route} sid="S02">
      <h2 className="auth-title">パスワード入力</h2>
      <p className="auth-lead">設備メンバーは、従業員番号とパスワードでログインします。</p>
      <div className="who-card">
        <Avatar emp={e} size="lg" />
        <div className="grow">
          <div className="tx-3 tiny">従業員番号</div>
          <div className="row">
            <span className="mono" style={{ fontSize: 16 }}>{e.empNo}</span>
            <b>{e.name}</b>
          </div>
          <div className="row small tx-2 mt-4">{deptName(db, e.deptId)} <RoleTags emp={e} /></div>
        </div>
      </div>
      <form onSubmit={(ev) => { ev.preventDefault(); setErr(loginStep2(pw)) }}>
        <Field label="パスワード" required error={err} hint={first ? '初めてログインするときのパスワードは、従業員番号です。' : undefined}>
          <div style={{ position: 'relative' }}>
            <input
              ref={input}
              type={show ? 'text' : 'password'}
              className={`input auth-input pw ${err ? 'invalid' : ''}`}
              value={pw}
              onChange={(ev) => { setPw(ev.target.value); setErr(null) }}
              placeholder="●●●●●●●●"
            />
            <button type="button" className="btn btn-ghost btn-sm btn-icon" style={{ position: 'absolute', right: 10, top: 12 }} onClick={() => setShow((v) => !v)} aria-label="表示切り替え">
              {show ? <EyeOff /> : <Eye />}
            </button>
          </div>
        </Field>
        <div className="row mt-16">
          <button type="button" className="btn btn-lg" onClick={() => go({ s: 'S01' })}><ArrowLeft /> 戻る</button>
          <button type="submit" className="btn btn-primary btn-lg grow"><LogIn /> ログイン</button>
        </div>
      </form>
      <button className="btn btn-sm btn-ghost mt-16" onClick={() => { setPw(first ? e.empNo : DEMO_PASSWORD); setErr(null) }}>
        <Sparkles /> デモ：パスワードを入力する（{first ? e.empNo : DEMO_PASSWORD}）
      </button>
      <p className="hint mt-12">パスワードを忘れた場合は、管理者・IT担当者がユーザー管理で初期化します（従業員番号に戻ります）。</p>
    </AuthLayout>
  )
}
