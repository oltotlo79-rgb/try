// 問い合わせ（要件 S18〜S20、M13〜M15）
import type { DB, Employee, Inquiry, InquiryCategory, Mail } from './types'
import { inquiryNumber, newId } from './ids'
import { deptName, findEmployee, isIT } from './rules'
import { mailM13, mailM14, mailM15 } from './mails'
import { RuleError, type Outcome } from './workflow'

/** 見られる問い合わせ：「全員に公開」は全社員、「IT担当者だけ」は質問者本人とIT担当者 */
export function canViewInquiry(q: Inquiry, user: Employee): boolean {
  return q.visibility === 'public' || q.userId === user.id || isIT(user)
}

export interface NewInquiry {
  category: InquiryCategory
  requestId: string | null
  title: string
  body: string
  attachmentName: string | null
  visibility: 'public' | 'it'
}

export function createInquiry(db: DB, user: Employee, f: NewInquiry, now: number): { inquiry: Inquiry } & Outcome {
  if (!f.title.trim()) throw new RuleError('件名を入力してください')
  if (!f.body.trim()) throw new RuleError('内容を入力してください')
  db.seq.inquiry += 1
  const q: Inquiry = {
    id: newId(db, 'inq'),
    number: inquiryNumber(new Date(now).getFullYear(), db.seq.inquiry),
    userId: user.id,
    category: f.category,
    requestId: f.requestId,
    title: f.title.trim(),
    body: f.body.trim(),
    attachmentName: f.attachmentName,
    visibility: f.visibility,
    status: 'open',
    createdAt: now,
    updatedAt: now,
    messages: [],
  }
  db.inquiries.push(q)
  const m = mailM13(db, q, user, deptName(db, user.deptId), now)
  db.mails.push(m)
  return { inquiry: q, mails: [m] }
}

/** IT担当者が書くと「回答」（→回答済み・M14）、質問者が書くと「追加の質問」（→未回答・M15） */
export function postInquiryMessage(db: DB, inqId: string, user: Employee, body: string, now: number): Outcome {
  const q = db.inquiries.find((x) => x.id === inqId)
  if (!q) throw new RuleError('問い合わせが見つかりません')
  if (!body.trim()) throw new RuleError('内容を入力してください')
  const asker = q.userId === user.id
  if (!asker && !isIT(user)) throw new RuleError('回答できるのはIT担当者と質問者だけです')
  const kind = asker ? 'question' : 'answer'
  q.messages.push({ id: newId(db, 'msg'), userId: user.id, kind, body: body.trim(), at: now })
  q.updatedAt = now
  let m: Mail
  if (kind === 'answer') {
    q.status = 'answered'
    m = mailM14(db, q, findEmployee(db, q.userId)!, body.trim(), now)
  } else {
    q.status = 'open'
    m = mailM15(db, q, body.trim(), now)
  }
  db.mails.push(m)
  return { mails: [m] }
}

export function resolveInquiry(db: DB, inqId: string, now: number): Outcome {
  const q = db.inquiries.find((x) => x.id === inqId)
  if (!q) throw new RuleError('問い合わせが見つかりません')
  q.status = 'resolved'
  q.updatedAt = now
  return { mails: [] }
}

export const INQUIRY_STATUS_LABEL = { open: '未回答', answered: '回答済み', resolved: '解決' } as const
