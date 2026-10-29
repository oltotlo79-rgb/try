// 承認回覧と進捗の業務ルール（要件「4_業務の流れ」「5_状態と承認ルール」）。
// どの関数も db を直接書き換え、送ったメールを返す（メールは db.mails にも入る）。
import type { ApprovalStep, ApprovalToken, DB, Employee, Mail, PersonSnap, TokenInvalidReason, WorkRequest } from './types'
import { newId, randomToken, requestNumber } from './ids'
import { DAY_MS, daysUntil, elapsedDays, fmtMDHM } from './format'
import {
  MAX_ASSIGNEES, TOKEN_TTL_DAYS, currentRoundSteps, familyName, findEmployee, isEquipment, pendingStep, snapOf, stepRoleLabel,
} from './rules'
import {
  mailM01, mailM02, mailM03, mailM04, mailM05, mailM06, mailM07, mailM08, mailM09, mailM10, mailM11,
} from './mails'

export interface Outcome {
  mails: Mail[]
}

export class RuleError extends Error {}

function emit(db: DB, out: Mail[], m: Mail) {
  db.mails.push(m)
  out.push(m)
}

function getRequest(db: DB, id: string): WorkRequest {
  const r = db.requests.find((x) => x.id === id)
  if (!r) throw new RuleError('依頼書が見つかりません')
  return r
}

function log(req: WorkRequest, now: number, actor: string, action: string, detail?: string) {
  req.history.push({ at: now, actor, action, detail })
}

/** 承認依頼を送る：新しい1回限りのURLを作り M02（リマインド時は M12）を送る */
function sendToStep(db: DB, req: WorkRequest, step: ApprovalStep, now: number, out: Mail[], reminder = false) {
  step.result = 'pending'
  if (!reminder) step.sentAt = now
  const token: ApprovalToken = {
    token: randomToken(),
    requestId: req.id,
    stepId: step.id,
    issuedAt: now,
    expiresAt: now + TOKEN_TTL_DAYS * DAY_MS,
    status: 'valid',
  }
  db.tokens.push(token)
  emit(db, out, mailM02(db, req, step, token.token, token.expiresAt, now, reminder))
}

function invalidateStepTokens(db: DB, stepId: string, reason: TokenInvalidReason) {
  for (const t of db.tokens) {
    if (t.stepId === stepId && t.status === 'valid') {
      t.status = 'invalid'
      t.invalidReason = reason
    }
  }
}

function cancelWaiting(req: WorkRequest) {
  for (const s of currentRoundSteps(req)) if (s.result === 'waiting') s.result = 'cancelled'
}

/** 回覧ルートを作る：回覧者1〜3（空欄は飛ばす）→ 有効な回覧先を設定の順番で。送信時点で固定する */
export function buildRoute(db: DB, req: WorkRequest, round: number): ApprovalStep[] {
  const steps: ApprovalStep[] = []
  req.reviewers.forEach((id, i) => {
    const e = findEmployee(db, id)
    if (!e) return
    steps.push({
      id: newId(db, 'step'), round, order: steps.length + 1, role: stepRoleLabel('reviewer', i + 1),
      kind: 'reviewer', approver: snapOf(db, e), result: 'waiting',
    })
  })
  db.targets
    .filter((t) => t.active)
    .sort((a, b) => a.order - b.order)
    .forEach((t, i) => {
      const e = findEmployee(db, t.employeeId)
      if (!e || !e.active) return
      steps.push({
        id: newId(db, 'step'), round, order: steps.length + 1, role: stepRoleLabel('target', i + 1),
        kind: 'target', approver: snapOf(db, e), result: 'waiting',
      })
    })
  return steps
}

/** 回覧者の入力チェック：1人以上必須、自分自身・同じ人を2回は不可 */
export function validateReviewers(req: WorkRequest): string | null {
  const ids = req.reviewers.filter((x): x is string => !!x)
  if (ids.length === 0) return '回覧者を1人以上選んでください'
  if (ids.includes(req.requester.employeeId)) return '自分自身は回覧者に選べません'
  if (new Set(ids).size !== ids.length) return '同じ人を2回は選べません'
  return null
}

/** 依頼する（S07）。初回は依頼番号を発行。差し戻し・引き戻し後の再依頼は最初の回覧者からやり直す */
export function submitRequest(db: DB, reqId: string, now: number): Outcome {
  const req = getRequest(db, reqId)
  if (!['draft', 'returned', 'pulledBack'].includes(req.status)) throw new RuleError('この依頼は送信できない状態です')
  const err = validateReviewers(req)
  if (err) throw new RuleError(err)
  const out: Mail[] = []
  const resubmit = req.status !== 'draft'
  if (!req.number) {
    db.seq.request += 1
    req.number = requestNumber(new Date(now).getFullYear(), db.seq.request)
  }
  if (!req.requestDate) req.requestDate = now
  req.round += 1
  const steps = buildRoute(db, req, req.round)
  req.steps.push(...steps)
  req.status = 'circulating'
  log(req, now, req.requester.name, resubmit ? '再依頼' : '依頼', `回覧${req.round}回目`)
  emit(db, out, mailM01(db, req, now))
  sendToStep(db, req, steps[0], now, out)
  return { mails: out }
}

export type TokenCheck =
  | { ok: true; token: ApprovalToken; req: WorkRequest; step: ApprovalStep }
  | { ok: false; reason: 'approved' | 'returned' | TokenInvalidReason | 'expired' | 'invalid'; req?: WorkRequest }

/** 承認用URLを開いたときの確認（使用済み・無効・期限切れは S13 で理由を表示） */
export function checkToken(db: DB, tokenStr: string, now: number): TokenCheck {
  const t = db.tokens.find((x) => x.token === tokenStr)
  if (!t) return { ok: false, reason: 'invalid' }
  const req = db.requests.find((r) => r.id === t.requestId)
  if (!req) return { ok: false, reason: 'invalid' }
  if (t.status === 'used') return { ok: false, reason: t.usedResult ?? 'approved', req }
  if (t.status === 'invalid') return { ok: false, reason: t.invalidReason ?? 'invalid', req }
  if (now > t.expiresAt) return { ok: false, reason: 'expired', req }
  const step = req.steps.find((s) => s.id === t.stepId)
  if (!step) return { ok: false, reason: 'invalid', req }
  return { ok: true, token: t, req, step }
}

function useToken(db: DB, tokenStr: string, now: number) {
  const chk = checkToken(db, tokenStr, now)
  if (!chk.ok) throw new RuleError('このURLは使えません')
  return chk
}

/** 次の承認者へ。最後なら回覧完了（M05→依頼者、M06→リーダー・管理者・IT担当者） */
function advance(db: DB, req: WorkRequest, now: number, out: Mail[]) {
  const next = currentRoundSteps(req).find((s) => s.result === 'waiting')
  if (next) {
    sendToStep(db, req, next, now, out)
    return
  }
  req.status = 'circulated'
  log(req, now, 'システム', '回覧完了')
  emit(db, out, mailM05(db, req, now))
  emit(db, out, mailM06(db, req, now))
}

/** 承認する（S12） */
export function approveByToken(db: DB, tokenStr: string, comment: string, now: number): Outcome {
  const { token, req, step } = useToken(db, tokenStr, now)
  const out: Mail[] = []
  token.status = 'used'
  token.usedResult = 'approved'
  step.result = 'approved'
  step.actedAt = now
  step.comment = comment.trim() || undefined
  step.drawingSnapshot = req.drawings.map((d) => `${d.id}@${d.revision}`)
  log(req, now, `${step.role} ${step.approver.name}`, '承認', step.comment)
  advance(db, req, now, out)
  return { mails: out }
}

/** 差し戻す（S12）。理由は必須。【日時 役割 氏名】を付けて追記し、前のコメントは消さない */
export function returnByToken(db: DB, tokenStr: string, comment: string, now: number): Outcome {
  if (!comment.trim()) throw new RuleError('差し戻す場合は理由を入力してください')
  const { token, req, step } = useToken(db, tokenStr, now)
  const out: Mail[] = []
  token.status = 'used'
  token.usedResult = 'returned'
  step.result = 'returned'
  step.actedAt = now
  step.comment = comment.trim()
  cancelWaiting(req)
  req.returnComments.push(`【${fmtMDHM(now)} ${step.role} ${familyName(step.approver.name)}】${comment.trim()}`)
  req.status = 'returned'
  log(req, now, `${step.role} ${step.approver.name}`, '差し戻し', comment.trim())
  emit(db, out, mailM03(db, req, step, comment.trim(), now))
  return { mails: out }
}

/** 引き戻す（S11）。回覧中だけ。承認待ちの人のURLは使えなくなり M04 を送る */
export function pullBack(db: DB, reqId: string, now: number): Outcome {
  const req = getRequest(db, reqId)
  if (req.status !== 'circulating') throw new RuleError('回覧中の依頼だけ引き戻せます')
  const out: Mail[] = []
  const p = pendingStep(req)
  if (p) {
    p.result = 'cancelled'
    invalidateStepTokens(db, p.id, 'pulledBack')
    emit(db, out, mailM04(db, req, p, now))
  }
  cancelWaiting(req)
  req.status = 'pulledBack'
  log(req, now, req.requester.name, '引き戻し')
  return { mails: out }
}

/** 取り下げ（S11：回覧完了前は依頼者、S27：管理者）。削除はせず記録を残す */
export function cancelRequest(db: DB, reqId: string, actor: PersonSnap, now: number): Outcome {
  const req = getRequest(db, reqId)
  if (req.status === 'done' || req.status === 'cancelled') throw new RuleError('この依頼は取り下げられません')
  const p = pendingStep(req)
  if (p) {
    p.result = 'cancelled'
    invalidateStepTokens(db, p.id, 'cancelled')
  }
  cancelWaiting(req)
  req.status = 'cancelled'
  req.cancelledAt = now
  log(req, now, actor.name, '取り下げ')
  return { mails: [] }
}

/** 代理承認（S27）。理由必須・記録に残る。M10→本来の承認者・依頼者、次へ M02 */
export function proxyApprove(db: DB, reqId: string, admin: Employee, reason: string, now: number): Outcome {
  if (!reason.trim()) throw new RuleError('代理承認の理由を入力してください')
  const req = getRequest(db, reqId)
  const p = pendingStep(req)
  if (req.status !== 'circulating' || !p) throw new RuleError('承認待ちの人がいません')
  const out: Mail[] = []
  const by = snapOf(db, admin)
  p.result = 'proxy'
  p.actedAt = now
  p.proxy = { by, reason: reason.trim() }
  p.drawingSnapshot = req.drawings.map((d) => `${d.id}@${d.revision}`)
  invalidateStepTokens(db, p.id, 'proxy')
  log(req, now, admin.name, '代理承認', `${p.role} ${p.approver.name}：${reason.trim()}`)
  emit(db, out, mailM10(db, req, p, by, reason.trim(), now))
  advance(db, req, now, out)
  return { mails: out }
}

/** 承認依頼メールの再送・承認者の変更（S27）。古いURLは使えなくなる */
export function resendApproval(db: DB, reqId: string, admin: Employee, now: number, newApproverId?: string): Outcome {
  const req = getRequest(db, reqId)
  const p = pendingStep(req)
  if (req.status !== 'circulating' || !p) throw new RuleError('承認待ちの人がいません')
  const out: Mail[] = []
  invalidateStepTokens(db, p.id, 'resent')
  if (newApproverId) {
    const e = findEmployee(db, newApproverId)
    if (!e) throw new RuleError('社員が見つかりません')
    log(req, now, admin.name, '承認者を変更して再送', `${p.role}：${p.approver.name} → ${e.name}`)
    p.approver = snapOf(db, e)
  } else {
    log(req, now, admin.name, '承認依頼メールを再送', `${p.role} ${p.approver.name}`)
  }
  sendToStep(db, req, p, now, out)
  return { mails: out }
}

export interface ProgressPatch {
  assignees: string[]
  ratios: number[]
  meetingDone: boolean
  meetingDate: string | null
  estimateDone: boolean
  estimateDate: string | null
  purchaseDone: boolean
  purchaseDate: string | null
  progress: number
  productionDate: string | null
  deliveryDate: string | null
  contribution: number | null
}

/** 依頼書詳細・進捗更新（S15）の保存 */
export function saveProgress(db: DB, reqId: string, actor: Employee, patch: ProgressPatch, now: number): Outcome {
  const req = getRequest(db, reqId)
  const ids = patch.assignees.filter(Boolean)
  if (ids.length > MAX_ASSIGNEES) throw new RuleError(`担当者は${MAX_ASSIGNEES}人までです`)
  if (new Set(ids).size !== ids.length) throw new RuleError('同じ人を2回は担当者に選べません')
  for (const id of ids) {
    if (!isEquipment(findEmployee(db, id))) throw new RuleError('担当者は設備メンバーから選んでください')
  }
  const ratios = ids.length <= 1 ? (ids.length ? [100] : []) : patch.ratios
  if (ratios.length !== ids.length || ratios.some((x) => x < 0 || x > 100 || !Number.isInteger(x)))
    throw new RuleError('配分は担当者ごとに0〜100％の整数で入力してください')
  if (ids.length && ratios.reduce((a, b) => a + b, 0) !== 100) throw new RuleError('配分の合計が100％になるように入力してください')
  if (patch.deliveryDate && !ids.length) throw new RuleError('担当者を決めてから引き渡し完了日を入力してください')
  // 打ち合わせ・見積り依頼・買い入れは「済／未」と日付の記録（要件 S15 ⑤〜⑦）
  if (patch.meetingDone && !patch.meetingDate) throw new RuleError('打ち合わせの実施日を入力してください')
  if (patch.estimateDone && !patch.estimateDate) throw new RuleError('見積り依頼日を入力してください')
  if (patch.purchaseDone && !patch.purchaseDate) throw new RuleError('買い入れ完了日を入力してください')
  patch = {
    ...patch,
    meetingDate: patch.meetingDone ? patch.meetingDate : null,
    estimateDate: patch.estimateDone ? patch.estimateDate : null,
    purchaseDate: patch.purchaseDone ? patch.purchaseDate : null,
  }
  const out: Mail[] = []
  const newly = ids.filter((id) => !req.assignees.includes(id))
  const hadDelivery = !!req.deliveryDate
  Object.assign(req, patch)
  req.assignees = ids
  req.ratios = ratios
  for (const id of newly) emit(db, out, mailM07(db, req, findEmployee(db, id)!, now))
  if (req.status === 'circulated' && ids.length) {
    req.status = 'inProgress'
    log(req, now, actor.name, '担当者を決定', ids.map((id) => findEmployee(db, id)?.name).join('・'))
  }
  if (req.status === 'inProgress' && req.deliveryDate && !hadDelivery) {
    req.status = 'done'
    req.progress = 100
    log(req, now, actor.name, '引き渡し完了')
    emit(db, out, mailM11(db, req, now))
  } else {
    log(req, now, actor.name, '進捗を更新', `製作進捗 ${req.progress}%`)
  }
  return { mails: out }
}

/** 毎朝8:00の自動処理（M08 納期フォロー・M12 リマインド・M09 承認停滞） */
export function morningBatch(db: DB, now: number): Outcome {
  const out: Mail[] = []
  for (const req of db.requests) {
    if (req.status === 'circulated' || req.status === 'inProgress') {
      const d = daysUntil(req.dueDate, now)
      if (d === 7 || d === 3 || d === 0 || d < 0) emit(db, out, mailM08(db, req, d, now))
    }
    if (req.status === 'circulating') {
      const p = pendingStep(req)
      if (!p?.sentAt) continue
      const days = elapsedDays(p.sentAt, now)
      if (days >= 3) emit(db, out, mailM09(db, req, p, days, now))
      else if (days >= 2) {
        invalidateStepTokens(db, p.id, 'resent')
        sendToStep(db, req, p, now, out, true)
      }
    }
  }
  return { mails: out }
}
