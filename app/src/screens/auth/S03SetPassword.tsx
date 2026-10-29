// S03 パスワード設定：初回ログイン時は必ず表示（設定するまで他の画面に進めない）。メニューの「パスワード変更」からも開く
import { useState } from 'react'
import { Check, Circle, KeyRound, ShieldCheck } from 'lucide-react'
import type { RouteOf } from '../../router'
import { useApp, useMe } from '../../store'
import { Field, PageHead, Panel } from '../../components/ui'
import './auth.css'

export default function S03SetPassword({ route }: { route: RouteOf<'S03'> }) {
  const me = useMe()
  const changePassword = useApp((s) => s.changePassword)
  const [cur, setCur] = useState('')
  const [next, setNext] = useState('')
  const [conf, setConf] = useState('')
  const [err, setErr] = useState<string | null>(null)
  if (!me) return null
  const rules: [boolean, string][] = [
    [next.length >= 8, '8文字以上'],
    [/[A-Za-z]/.test(next) && /\d/.test(next), '英字と数字を両方含む'],
    [!!next && next !== me.empNo, '従業員番号と同じものは使えない'],
    [!!conf && next === conf, '確認用と一致'],
  ]
  const form = (
    <form onSubmit={(e) => { e.preventDefault(); setErr(changePassword(cur, next, conf)) }} className="col gap-16">
      {route.forced && (
        <div className="notice info">
          <ShieldCheck />
          <span>初めてのログインのため、パスワードを設定してください。設定するまで他の画面には進めません。</span>
        </div>
      )}
      <Field label="現在のパスワード" required hint={route.forced ? '初回は従業員番号です' : undefined}>
        <input type="password" className="input" value={cur} onChange={(e) => setCur(e.target.value)} autoFocus />
      </Field>
      <Field label="新しいパスワード" required>
        <input type="password" className="input" value={next} onChange={(e) => setNext(e.target.value)} />
      </Field>
      <Field label="新しいパスワード（確認）" required error={err}>
        <input type="password" className="input" value={conf} onChange={(e) => setConf(e.target.value)} />
      </Field>
      <ul className="pw-rules">
        {rules.map(([ok, t]) => (
          <li key={t} className={ok ? 'ok' : ''}>{ok ? <Check /> : <Circle />}{t}</li>
        ))}
      </ul>
      <div className="row end">
        <button type="submit" className="btn btn-primary btn-lg"><KeyRound /> 設定する</button>
      </div>
      <p className="hint">パスワードは元に戻せない形（ハッシュ化）で保存します。システムの管理者でも中身は見られません。（サンプルでは簡略化しています）</p>
    </form>
  )
  if (route.forced) {
    return (
      <div className="center-card">
        <div style={{ width: 520 }}>
          <div className="eyebrow"><span className="sid">S03</span>SET PASSWORD</div>
          <h1 className="page-title" style={{ marginBottom: 18 }}>パスワード設定</h1>
          <Panel glow>{form}</Panel>
        </div>
      </div>
    )
  }
  return (
    <div className="page narrow">
      <PageHead sid="S03" en="CHANGE PASSWORD" title="パスワード変更" desc="自分のパスワードを変更します。" />
      <Panel>{form}</Panel>
    </div>
  )
}
