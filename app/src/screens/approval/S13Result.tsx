// S13 処理結果・お知らせ：承認・差し戻しの結果や、URLが使えない理由を表示する（ボタンはない）
import type { RouteOf } from '../../router'
import { useApp } from '../../store'
import { checkToken, type TokenCheck } from '../../domain/workflow'
import { ApproverBar } from './S12Approve'
import imgApproved from '../../assets/img/result_approved.webp'
import imgReturned from '../../assets/img/result_returned.webp'
import imgInvalid from '../../assets/img/result_invalid.webp'
import './approval.css'

type Reason = Extract<TokenCheck, { ok: false }>['reason']

const MESSAGES: Record<Reason, [string, string]> = {
  approved: ['承認済み', 'この依頼はすでに承認済みです。'],
  returned: ['差し戻し済み', 'この依頼はすでに差し戻し済みです。'],
  pulledBack: ['依頼者が引き戻した', 'この依頼は依頼者により引き戻されました。対応は不要です。'],
  proxy: ['管理者が代理承認した', 'この依頼は管理者により代理で承認されました。対応は不要です。'],
  cancelled: ['依頼が取り下げられた', 'この依頼は取り下げられました。対応は不要です。'],
  expired: ['有効期限切れ', 'このURLは有効期限が切れています。設備の管理者へお問い合わせください。'],
  invalid: ['URLが間違っている', 'URLが正しくありません。'],
  resent: ['新しいURLを送った', 'このURLは使えなくなりました。新しく届いたメールのURLから開いてください。'],
}

export default function S13Result({ route }: { route: RouteOf<'S13'> }) {
  const db = useApp((s) => s.db)
  if (route.done) return <ResultView route={route} />
  const chk = checkToken(db, route.token, Date.now())
  return <ResultView route={route} reason={chk.ok ? undefined : chk.reason} />
}

export function ResultView({ route, reason }: { route: RouteOf<'S13'>; reason?: Reason }) {
  const done = route.done
  const img = done === 'approved' ? imgApproved : done === 'returned' ? imgReturned : reason === 'approved' ? imgApproved : imgInvalid
  const title = done === 'approved' ? '承認しました。' : done === 'returned' ? '差し戻しました。' : reason ? MESSAGES[reason][1] : ''
  const tone = done === 'approved' ? 'ok' : done === 'returned' ? 'warn' : 'muted'
  return (
    <div className="approver-page">
      <ApproverBar token={route.token} />
      <div className="approver-scroll">
        <div className="result-card">
          <img className="result-img" src={img} alt="" />
          <div className="eyebrow" style={{ justifyContent: 'center' }}>
            <span className="sid">S13</span>{done ? 'RESULT' : 'NOTICE'}
          </div>
          <h1 className={`result-title tx-${tone}`}>{done ? `✔ ${title}` : title}</h1>
          {route.nextLabel && <p className="result-next">{route.nextLabel}</p>}
          {!done && reason && <p className="result-next tx-3">（状況：{MESSAGES[reason][0]}）</p>}
          <div className="divider" style={{ width: 280, margin: '22px auto' }} />
          <p className="tx-3 small">このページは閉じて構いません。</p>
        </div>
      </div>
    </div>
  )
}
