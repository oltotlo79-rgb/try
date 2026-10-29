// 権限・状態表示・参照のための小さな関数群（要件「3_利用者と権限」「5_状態と承認ルール」）
import type { ApprovalStep, DB, Employee, PersonSnap, RequestStatus, WorkRequest } from './types'
import { daysUntil } from './format'

export const APP_NAME = '制作物依頼システム'
export const BASE_URL = 'https://seisaku.example.local'
export const TOKEN_TTL_DAYS = 14
export const MAX_DRAWINGS = 10
/** 担当者の上限（要件は2人まで。ユーザー指示で2人以上に拡張） */
export const MAX_ASSIGNEES = 5

/** 均等な配分（％）。端数は先頭の人から1％ずつ足す：3人 → 34/33/33 */
export function equalRatios(n: number): number[] {
  if (n <= 0) return []
  const base = Math.floor(100 / n)
  return Array.from({ length: n }, (_, i) => base + (i < 100 - base * n ? 1 : 0))
}

export const isEquipment = (e: Employee | null | undefined) => !!e?.roles.equipment
export const isLeaderPlus = (e: Employee | null | undefined) =>
  !!e && (e.roles.leader || e.roles.manager || e.roles.it)
export const isAdmin = (e: Employee | null | undefined) => !!e && (e.roles.manager || e.roles.it)
export const isIT = (e: Employee | null | undefined) => !!e?.roles.it

/** 「設備・リーダー」のような権限の表示 */
export function roleLabel(e: Employee): string {
  const parts: string[] = []
  if (e.roles.equipment) parts.push('設備')
  if (e.roles.leader) parts.push('リーダー')
  if (e.roles.manager) parts.push('管理者')
  if (e.roles.it) parts.push('IT担当者')
  return parts.length ? parts.join('・') : '一般'
}

/** 画面の色分けに使う役割（要件の色：緑=依頼者 青=設備 紫=管理者・IT） */
export function roleTone(e: Employee): 'requester' | 'equipment' | 'admin' {
  if (isAdmin(e)) return 'admin'
  if (isEquipment(e)) return 'equipment'
  return 'requester'
}

export function findEmployee(db: DB, id: string | null | undefined): Employee | undefined {
  if (!id) return undefined
  return db.employees.find((e) => e.id === id)
}

export function deptName(db: DB, deptId: string): string {
  return db.departments.find((d) => d.id === deptId)?.name ?? '—'
}

export function snapOf(db: DB, e: Employee): PersonSnap {
  return { employeeId: e.id, name: e.name, dept: deptName(db, e.deptId), email: e.email, position: e.position }
}

/** 「伊藤」のような姓 */
export const familyName = (name: string) => name.split(/[\s　]/)[0]

export const STATUS_LABEL: Record<RequestStatus, string> = {
  draft: '下書き',
  circulating: '回覧中',
  returned: '差し戻し中',
  pulledBack: '引き戻し中',
  circulated: '回覧完了（打ち合わせ待ち）',
  inProgress: '対応中',
  done: '完了',
  cancelled: '取り下げ',
}

/** 一覧での色（要件：白／オレンジ／青／グレー） */
export type StatusTone = 'neutral' | 'warn' | 'info' | 'muted' | 'success'
export const STATUS_TONE: Record<RequestStatus, StatusTone> = {
  draft: 'muted',
  circulating: 'neutral',
  returned: 'warn',
  pulledBack: 'warn',
  circulated: 'info',
  inProgress: 'info',
  done: 'muted',
  cancelled: 'muted',
}

export function currentRoundSteps(req: WorkRequest): ApprovalStep[] {
  return req.steps.filter((s) => s.round === req.round).sort((a, b) => a.order - b.order)
}

export function pendingStep(req: WorkRequest): ApprovalStep | undefined {
  return currentRoundSteps(req).find((s) => s.result === 'pending')
}

/**
 * 回覧完了〜対応中の工程。S15 で入力した「打ち合わせ・見積り依頼・買い入れ・製作完了・引き渡し」から判定する
 * （要件の状態は「対応中」1つ。一覧で進み具合が分かるように工程を添える）
 */
export type WorkStage = 'waitMeeting' | 'waitAssign' | 'waitEstimate' | 'waitPurchase' | 'production' | 'waitDelivery'

export const STAGE_LABEL: Record<WorkStage, string> = {
  waitMeeting: '打ち合わせ待ち',
  waitAssign: '担当者待ち',
  waitEstimate: '見積り依頼待ち',
  waitPurchase: '買い入れ待ち',
  production: '製作中',
  waitDelivery: '引き渡し待ち',
}

/** 一覧の工程の並び（担当者待ちは打ち合わせ済みで担当者が未定の珍しいケース） */
export const STAGE_FLOW: WorkStage[] = ['waitMeeting', 'waitEstimate', 'waitPurchase', 'production', 'waitDelivery']

export function workStage(req: WorkRequest): WorkStage | null {
  if (req.status === 'circulated') return req.meetingDone ? 'waitAssign' : 'waitMeeting'
  if (req.status !== 'inProgress') return null
  if (req.productionDate || req.progress >= 100) return 'waitDelivery'
  if (!req.meetingDone) return 'waitMeeting'
  if (!req.estimateDone) return 'waitEstimate'
  if (!req.purchaseDone) return 'waitPurchase'
  return 'production'
}

/** 「回覧中（回覧者3の承認待ち）」「対応中（買い入れ待ち・製作進捗 0%）」 */
export function statusText(req: WorkRequest): string {
  if (req.status === 'circulating') {
    const p = pendingStep(req)
    return p ? `回覧中（${p.role}の承認待ち）` : '回覧中'
  }
  if (req.status === 'circulated') return `回覧完了（${STAGE_LABEL[workStage(req)!]}）`
  if (req.status === 'inProgress') return `対応中（${STAGE_LABEL[workStage(req)!]}・製作進捗 ${req.progress}%）`
  return STATUS_LABEL[req.status]
}

/** 一覧用の短い状態表示 */
export function statusShort(req: WorkRequest): string {
  if (req.status === 'circulating') {
    const p = pendingStep(req)
    return p ? `回覧中（${p.role}）` : '回覧中'
  }
  if (req.status === 'circulated') return `回覧完了・${STAGE_LABEL[workStage(req)!]}`
  if (req.status === 'inProgress') {
    const st = workStage(req)!
    return st === 'production' ? `対応中・製作中 ${req.progress}%` : `対応中・${STAGE_LABEL[st]}`
  }
  return STATUS_LABEL[req.status]
}

/** 納期の色分け：赤＝納期超過、黄＝7日以内（完了・取り下げは対象外） */
export function dueTone(req: WorkRequest, now: number): 'overdue' | 'soon' | null {
  if (req.status === 'done' || req.status === 'cancelled' || req.status === 'draft') return null
  const d = daysUntil(req.dueDate, now)
  if (d < 0) return 'overdue'
  if (d <= 7) return 'soon'
  return null
}

export const isAssignee = (req: WorkRequest, userId: string) => req.assignees.includes(userId)

/** S15 の項目ごとの入力可否（要件 S15「入力ルール・権限」） */
export function canEditField(
  field: 'assignees' | 'meeting' | 'contribution' | 'estimate' | 'purchase' | 'progress' | 'production' | 'delivery',
  user: Employee,
  req: WorkRequest,
): boolean {
  if (req.status === 'cancelled' || req.status === 'circulating' || req.status === 'returned' || req.status === 'pulledBack')
    return false
  if (field === 'assignees' || field === 'meeting' || field === 'contribution') return isLeaderPlus(user)
  return isLeaderPlus(user) || (isEquipment(user) && isAssignee(req, user.id))
}

/** 依頼者が引き戻せるか（回覧中のみ） */
export const canPullBack = (req: WorkRequest) => req.status === 'circulating'
/** 依頼者が編集・再依頼できるか */
export const canResubmit = (req: WorkRequest) => req.status === 'returned' || req.status === 'pulledBack'
/** 依頼者が取り下げられるか（回覧完了前のみ） */
export const canRequesterCancel = (req: WorkRequest) =>
  req.status === 'circulating' || req.status === 'returned' || req.status === 'pulledBack'

export function stepRoleLabel(kind: 'reviewer' | 'target', index: number) {
  return kind === 'reviewer' ? `回覧者${index}` : `回覧先${index}`
}
