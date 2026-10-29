// 自動で送るメール（要件「10_メール通知」M01〜M15）。サンプルのため実際には送らず、アプリ内のメールBOXに届ける。
import type { ApprovalStep, DB, Employee, Inquiry, Mail, MailRecipient, MailType, PersonSnap, WorkRequest } from './types'
import { newId } from './ids'
import { BASE_URL, currentRoundSteps, findEmployee, isAdmin, isIT, isLeaderPlus, statusText } from './rules'
import { fmtDate, fmtDateTime } from './format'

export const MAIL_FROM = '制作物依頼システム <noreply@example.co.jp>'

const MAIL_NAMES: Record<MailType, string> = {
  M01: '依頼受付のお知らせ',
  M02: '承認依頼',
  M03: '差し戻しのお知らせ',
  M04: '引き戻しのお知らせ',
  M05: '回覧完了・打ち合わせ設定のお願い',
  M06: '新規依頼の到着',
  M07: '担当者任命',
  M08: '納期フォロー',
  M09: '承認停滞のお知らせ',
  M10: '代理承認のお知らせ',
  M11: '引き渡し完了のお知らせ',
  M12: '承認のリマインド',
  M13: '新しい問い合わせ',
  M14: '問い合わせへの回答',
  M15: '問い合わせへの追加の質問',
}
export const mailName = (t: MailType) => MAIL_NAMES[t]

const SEND_ONLY = '※ このメールは送信専用です。返信されても対応できません。'

export const rcpt = (p: PersonSnap | Employee): MailRecipient =>
  'employeeId' in p
    ? { employeeId: p.employeeId, name: p.name, email: p.email }
    : { employeeId: p.id, name: p.name, email: p.email }

const sama = (names: MailRecipient[]) =>
  names.length === 1 ? `${names[0].name.split(/[\s　]/)[0]} 様` : '各位'

function base(
  db: DB,
  type: MailType,
  to: MailRecipient[],
  subject: string,
  now: number,
  extra: Partial<Mail> = {},
): Mail {
  return {
    id: newId(db, 'mail'),
    type,
    to,
    cc: [],
    subject,
    sentAt: now,
    greeting: sama(to),
    paragraphs: [],
    facts: [],
    notes: [SEND_ONLY],
    read: false,
    ...extra,
  }
}

const reqFacts = (req: WorkRequest): [string, string][] => [
  ['依頼番号', req.number],
  ['件名', req.title],
  ['依頼部署', `${req.requester.dept}　${req.requester.name}`],
  ['納期', fmtDate(req.dueDate)],
]

/** URLに出す番号：R2026-0123 → 123 */
export const urlNo = (req: WorkRequest) => String(Number(req.number.slice(-4)) || req.id.replace(/\D/g, ''))

const requesterLink = (req: WorkRequest) => ({
  caption: '依頼の詳細はこちら（ログインが必要です）',
  url: `${BASE_URL}/my/requests/${urlNo(req)}`,
  target: { screen: 'S11' as const, requestId: req.id },
})

const equipmentLink = (req: WorkRequest) => ({
  caption: '依頼書の詳細はこちら（ログインが必要です）',
  url: `${BASE_URL}/requests/${urlNo(req)}`,
  target: { screen: 'S15' as const, requestId: req.id },
})

/** 回覧ルート「回覧者1 木村 → 回覧者3 山本 → 回覧先1 鈴木 …」 */
export function routeText(req: WorkRequest): string {
  return currentRoundSteps(req)
    .map((s) => `${s.role} ${s.approver.name.split(/[\s　]/)[0]}`)
    .join(' → ')
}

/** 承認状況「回覧者1 承認済み → 【回覧者3（あなた）】 → 回覧先」 */
function approvalProgressText(req: WorkRequest, me: ApprovalStep): string {
  const steps = currentRoundSteps(req)
  const parts: string[] = []
  for (const s of steps) {
    if (s.id === me.id) parts.push(`【${s.role}（あなた）】`)
    else if (s.result === 'approved') parts.push(`${s.role} 承認済み`)
    else if (s.result === 'proxy') parts.push(`${s.role} 代理承認`)
  }
  if (steps.some((s) => s.order > me.order)) parts.push(me.kind === 'reviewer' ? '回覧先' : '以降の回覧先')
  return parts.join(' → ')
}

export function mailM01(db: DB, req: WorkRequest, now: number): Mail {
  const to = [rcpt(req.requester)]
  return base(db, 'M01', to, `【制作物依頼】受付しました（${req.number} ${req.title}）`, now, {
    requestId: req.id,
    paragraphs: ['制作物依頼を受け付けました。', '承認の進み具合は「自分の依頼」でいつでも確認できます。'],
    facts: [...reqFacts(req), ['回覧ルート', routeText(req)]],
    link: requesterLink(req),
  })
}

export function mailM02(db: DB, req: WorkRequest, step: ApprovalStep, token: string, expiresAt: number, now: number, reminder = false): Mail {
  const to = [rcpt(step.approver)]
  const subject = reminder
    ? `【再送】承認のお願い 制作物依頼 ${req.number}`
    : `【承認のお願い】制作物依頼 ${req.number}「${req.title}」`
  return base(db, reminder ? 'M12' : 'M02', to, subject, now, {
    requestId: req.id,
    paragraphs: [
      ...(reminder ? ['承認待ちが2日続いているため、新しいURLでお送りしています（以前のURLは使えません）。'] : []),
      `${req.requester.dept} ${req.requester.name} さんから、制作物依頼の承認依頼が届いています。`,
      '内容をご確認のうえ、下記のURLから「承認」または「差し戻し」を選択してください。',
    ],
    facts: [
      ['依頼番号', req.number],
      ['件名', req.title],
      ['納期', fmtDate(req.dueDate)],
      ['承認状況', approvalProgressText(req, step)],
    ],
    link: {
      caption: '承認はこちら（このURLはあなた専用・1回限りです。社内ネットワークからのみ開けます）',
      url: `${BASE_URL}/approve/${token}`,
      target: { screen: 'S12', token },
      expiresAt,
    },
    notes: ['※ このメールは転送しないでください。', SEND_ONLY],
  })
}

export function mailM03(db: DB, req: WorkRequest, step: ApprovalStep, comment: string, now: number): Mail {
  return base(db, 'M03', [rcpt(req.requester)], `【差し戻し】制作物依頼 ${req.number} を修正してください`, now, {
    requestId: req.id,
    paragraphs: ['承認者から依頼の修正を求められました。', '「自分の依頼」から詳細を開き「編集・再依頼する」で修正してください。'],
    facts: [...reqFacts(req), ['差し戻した人', `${step.role} ${step.approver.name}（${step.approver.dept}）`], ['コメント', comment]],
    link: requesterLink(req),
  })
}

export function mailM04(db: DB, req: WorkRequest, step: ApprovalStep, now: number): Mail {
  return base(db, 'M04', [rcpt(step.approver)], `【対応不要】制作物依頼 ${req.number} は引き戻されました`, now, {
    requestId: req.id,
    paragraphs: [
      `${req.requester.dept} ${req.requester.name} さんが依頼を引き戻したため、承認の対応は不要になりました。`,
      '先にお送りした承認用のURLは使えなくなっています。',
    ],
    facts: reqFacts(req),
  })
}

const leadersAndManagers = (db: DB) => db.employees.filter((e) => e.active && (e.roles.leader || e.roles.manager))
const leadersManagersIT = (db: DB) => db.employees.filter((e) => e.active && isLeaderPlus(e))
const managersAndIT = (db: DB) => db.employees.filter((e) => e.active && isAdmin(e))
const itStaff = (db: DB) => db.employees.filter((e) => e.active && isIT(e))

export function mailM05(db: DB, req: WorkRequest, now: number): Mail {
  const leader = leadersAndManagers(db).find((e) => e.roles.leader)
  return base(db, 'M05', [rcpt(req.requester)], `【回覧完了】制作物依頼 ${req.number} 打ち合わせを設定してください`, now, {
    requestId: req.id,
    cc: leadersAndManagers(db).map(rcpt),
    paragraphs: ['すべての承認が完了しました。', '設備担当と打ち合わせの日程を設定してください。'],
    facts: [...reqFacts(req), ['設備側の窓口', leader ? `${leader.name}（${leader.email}）` : '設備課']],
    link: requesterLink(req),
  })
}

export function mailM06(db: DB, req: WorkRequest, now: number): Mail {
  return base(db, 'M06', leadersManagersIT(db).map(rcpt), `【新規依頼】担当者を割り当ててください（${req.number}）`, now, {
    requestId: req.id,
    paragraphs: ['回覧が完了した新しい依頼が届きました。担当者を割り当ててください。'],
    facts: [...reqFacts(req), ['依頼内容', req.description.slice(0, 80)]],
    link: equipmentLink(req),
  })
}

export function mailM07(db: DB, req: WorkRequest, assignee: Employee, now: number): Mail {
  return base(db, 'M07', [rcpt(assignee)], `【担当者任命】制作物依頼 ${req.number} の担当者になりました`, now, {
    requestId: req.id,
    paragraphs: ['次の依頼の担当者に任命されました。'],
    facts: reqFacts(req),
    link: equipmentLink(req),
  })
}

export function mailM08(db: DB, req: WorkRequest, days: number, now: number): Mail {
  const when = days > 0 ? `納期まであと${days}日です` : days === 0 ? '本日が納期です' : `納期を${-days}日過ぎています`
  const assignees = req.assignees.map((id) => findEmployee(db, id)).filter((e): e is Employee => !!e)
  return base(db, 'M08', [rcpt(req.requester), ...managersAndIT(db).filter((e) => e.roles.manager).map(rcpt)], `【納期フォロー】制作物依頼 ${req.number} ${when}`, now, {
    requestId: req.id,
    cc: assignees.map(rcpt),
    greeting: '関係者各位',
    paragraphs: [`引き渡しが完了していない依頼の${when.replace('です', '')}。`],
    facts: [
      ...reqFacts(req),
      ['現在の状態', statusText(req)],
      ['担当者', assignees.length ? assignees.map((e) => e.name).join('・') : '未定'],
    ],
    link: requesterLink(req),
  })
}

export function mailM09(db: DB, req: WorkRequest, step: ApprovalStep, days: number, now: number): Mail {
  return base(db, 'M09', managersAndIT(db).map(rcpt), `【承認停滞】制作物依頼 ${req.number} が${step.role}で${days}日止まっています`, now, {
    requestId: req.id,
    paragraphs: ['承認待ちが続いています。必要に応じて代理承認・再送を行ってください。'],
    facts: [...reqFacts(req), ['止まっている人', `${step.role} ${step.approver.name}（${step.approver.dept}）`], ['経過日数', `${days}日（${fmtDateTime(step.sentAt)} 送信）`]],
    link: {
      caption: '依頼書の管理はこちら（ログインが必要です）',
      url: `${BASE_URL}/settings/requests/${urlNo(req)}`,
      target: { screen: 'S27', requestId: req.id },
    },
  })
}

export function mailM10(db: DB, req: WorkRequest, step: ApprovalStep, by: PersonSnap, reason: string, now: number): Mail {
  return base(db, 'M10', [rcpt(step.approver), rcpt(req.requester)], `【お知らせ】制作物依頼 ${req.number} は代理で承認されました`, now, {
    requestId: req.id,
    greeting: '関係者各位',
    paragraphs: [`${step.role}（${step.approver.name}）の承認を、管理者が代理で行いました。`, '先にお送りした承認用のURLは使えなくなっています。'],
    facts: [...reqFacts(req), ['代理承認した人', `${by.name}（${by.dept}）`], ['理由', reason]],
  })
}

export function mailM11(db: DB, req: WorkRequest, now: number): Mail {
  const assignees = req.assignees.map((id) => findEmployee(db, id)).filter((e): e is Employee => !!e)
  return base(db, 'M11', [rcpt(req.requester)], `【完了】制作物依頼 ${req.number} の引き渡しが完了しました`, now, {
    requestId: req.id,
    paragraphs: ['ご依頼の制作物の引き渡しが完了しました。ご利用ありがとうございました。'],
    facts: [...reqFacts(req), ['引き渡し完了日', fmtDate(req.deliveryDate)], ['担当者', assignees.map((e) => e.name).join('・') || '—']],
    link: requesterLink(req),
  })
}

const inquiryLink = (q: Inquiry) => ({
  caption: '問い合わせの詳細はこちら（ログインが必要です）',
  url: `${BASE_URL}/inquiries/${q.number.slice(-4).replace(/^0+/, '')}`,
  target: { screen: 'S20' as const, inquiryId: q.id },
})

export function mailM13(db: DB, q: Inquiry, asker: Employee, deptName: string, now: number): Mail {
  return base(db, 'M13', itStaff(db).map(rcpt), `【問い合わせ】${q.number} ${q.title}`, now, {
    inquiryId: q.id,
    paragraphs: ['新しい問い合わせが届きました。'],
    facts: [['質問者', `${deptName} ${asker.name}`], ['分類', q.category], ['件名', q.title], ['内容', q.body]],
    link: inquiryLink(q),
  })
}

export function mailM14(db: DB, q: Inquiry, asker: Employee, body: string, now: number): Mail {
  return base(db, 'M14', [rcpt(asker)], `【回答】${q.number} ${q.title}`, now, {
    inquiryId: q.id,
    paragraphs: ['問い合わせに回答がありました。'],
    facts: [['件名', q.title], ['回答', body]],
    link: inquiryLink(q),
  })
}

export function mailM15(db: DB, q: Inquiry, body: string, now: number): Mail {
  return base(db, 'M15', itStaff(db).map(rcpt), `【追加の質問】${q.number} ${q.title}`, now, {
    inquiryId: q.id,
    paragraphs: ['問い合わせに追加の質問がありました。'],
    facts: [['件名', q.title], ['追加の質問', body]],
    link: inquiryLink(q),
  })
}
