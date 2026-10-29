// 制作物依頼システム（サンプル）のデータ型。要件定義書「11_データ項目」を簡略化したもの。

export interface Roles {
  equipment: boolean // 設備メンバー
  leader: boolean // リーダー
  manager: boolean // 管理者
  it: boolean // IT担当者
}

export interface Employee {
  id: string // = 従業員番号
  empNo: string
  name: string
  kana: string
  deptId: string
  position: string
  email: string
  active: boolean
  roles: Roles
  /** サンプルのため平文。実システムではハッシュ化（Argon2id） */
  password: string | null
  passwordChanged: boolean
  failedCount: number
  lockedUntil: number | null
  lastLoginAt: number | null
}

export interface Department {
  id: string
  code: string
  name: string
  reviewers: [string | null, string | null, string | null]
  active: boolean
}

export interface CirculationTarget {
  id: string
  order: number
  employeeId: string
  active: boolean
}

/** 回覧進捗（状態） */
export type RequestStatus =
  | 'circulating' // 回覧中
  | 'returned' // 差し戻し中
  | 'pulledBack' // 引き戻し中
  | 'circulated' // 回覧完了（打ち合わせ待ち）
  | 'inProgress' // 対応中
  | 'done' // 完了
  | 'cancelled' // 取り下げ
  | 'draft' // 下書き（送信前・画面上のみ）

/** 依頼した時点の社員情報の写し */
export interface PersonSnap {
  employeeId: string
  name: string
  dept: string
  email: string
  position: string
}

export type StepResult = 'waiting' | 'pending' | 'approved' | 'returned' | 'proxy' | 'cancelled'

export interface ApprovalStep {
  id: string
  round: number
  order: number
  role: string // 回覧者1 / 回覧者3 / 回覧先1 …
  kind: 'reviewer' | 'target'
  approver: PersonSnap
  result: StepResult
  comment?: string
  sentAt?: number
  actedAt?: number
  proxy?: { by: PersonSnap; reason: string }
  /** 承認したときの図面（id@版） */
  drawingSnapshot?: string[]
}

export type TokenInvalidReason = 'pulledBack' | 'proxy' | 'resent' | 'cancelled' | 'returned'

export interface ApprovalToken {
  token: string
  requestId: string
  stepId: string
  issuedAt: number
  expiresAt: number
  status: 'valid' | 'used' | 'invalid'
  usedResult?: 'approved' | 'returned'
  invalidReason?: TokenInvalidReason
}

export interface Drawing {
  id: string
  sheetNo: number
  revision: number
  name: string
  drawingNo: string
  material: string
  json: string
  savedBy: string
  savedAt: number
}

export interface Attachment {
  id: string
  fileName: string
  kind: 'image' | 'pdf'
  /** 表示用の画像URL（サンプル写真） */
  src?: string
  size: number
}

export interface HistoryEntry {
  at: number
  actor: string
  action: string
  detail?: string
}

export interface WorkRequest {
  id: string
  number: string // R2026-0123（送信前は空）
  requestDate: number | null
  createdAt: number
  requester: PersonSnap
  title: string
  description: string
  dueDate: string // YYYY-MM-DD
  drawings: Drawing[]
  attachments: Attachment[]
  reviewers: [string | null, string | null, string | null]
  returnComments: string[]
  status: RequestStatus
  round: number
  steps: ApprovalStep[]
  /** 担当者（設備メンバー・MAX_ASSIGNEES人まで） */
  assignees: string[]
  /** 貢献額の配分（％）。assignees と同じ順・合計100 */
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
  cancelledAt: number | null
  history: HistoryEntry[]
}

export interface OtherWork {
  id: string
  requestDate: string
  deptId: string
  requesterName: string
  assignees: string[]
  ratios: number[]
  title: string
  progress: number
  completedDate: string | null
  contribution: number | null
  createdBy: string
  createdAt: number
}

export type InquiryCategory = '使い方' | '不具合' | '要望' | 'その他'
export type InquiryStatus = 'open' | 'answered' | 'resolved'

export interface InquiryMessage {
  id: string
  userId: string
  kind: 'answer' | 'question'
  body: string
  at: number
}

export interface Inquiry {
  id: string
  number: string // Q2026-0015
  userId: string
  category: InquiryCategory
  requestId: string | null
  title: string
  body: string
  attachmentName: string | null
  visibility: 'public' | 'it'
  status: InquiryStatus
  createdAt: number
  updatedAt: number
  messages: InquiryMessage[]
}

export interface ImportLog {
  id: string
  at: number
  fileName: string
  added: number
  updated: number
  deactivated: number
  errors: number
  by: string
}

export type MailType =
  | 'M01' | 'M02' | 'M03' | 'M04' | 'M05' | 'M06' | 'M07' | 'M08'
  | 'M09' | 'M10' | 'M11' | 'M12' | 'M13' | 'M14' | 'M15'

export interface MailRecipient {
  employeeId: string
  name: string
  email: string
}

/** メール内のURLを押したときの行き先 */
export type MailLinkTarget =
  | { screen: 'S12'; token: string }
  | { screen: 'S11'; requestId: string }
  | { screen: 'S15'; requestId: string }
  | { screen: 'S20'; inquiryId: string }
  | { screen: 'S27'; requestId: string }

export interface Mail {
  id: string
  type: MailType
  to: MailRecipient[]
  cc: MailRecipient[]
  subject: string
  sentAt: number
  greeting: string
  paragraphs: string[]
  facts: [string, string][]
  link?: { caption: string; url: string; target: MailLinkTarget; expiresAt?: number }
  notes: string[]
  requestId?: string
  inquiryId?: string
  read: boolean
}

export interface DB {
  employees: Employee[]
  departments: Department[]
  targets: CirculationTarget[]
  requests: WorkRequest[]
  tokens: ApprovalToken[]
  otherWorks: OtherWork[]
  inquiries: Inquiry[]
  importLogs: ImportLog[]
  mails: Mail[]
  seq: { request: number; inquiry: number; id: number }
}
