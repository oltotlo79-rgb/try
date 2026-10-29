import { describe, expect, it } from 'vitest'
import { buildSeed } from '../data/seed'
import type { DB } from './types'
import { createDraft } from './requests'
import { approveByToken, checkToken, morningBatch, proxyApprove, pullBack, resendApproval, returnByToken, saveProgress, submitRequest } from './workflow'
import { canEditField, currentRoundSteps, equalRatios, findEmployee, pendingStep } from './rules'
import { parseEmployeeCsv } from './importer'
import { contributionRows, splitAmount } from './stats'
import { DAY_MS } from './format'

const NOW = new Date(2026, 9, 29, 10, 0).getTime()
const tokenOf = (db: DB, stepId: string) => db.tokens.find((t) => t.stepId === stepId && t.status === 'valid')!.token

function newRequest(db: DB) {
  const yamada = findEmployee(db, '20101')!
  const r = createDraft(db, yamada, NOW)
  r.title = 'テスト'
  r.description = '内容'
  r.dueDate = '2026-11-30'
  return r
}

describe('承認回覧', () => {
  it('回覧者の空欄を飛ばし、回覧先1〜3まで順に回る。最後で回覧完了', () => {
    const db = buildSeed(NOW)
    const r = newRequest(db)
    expect(r.reviewers).toEqual(['20110', null, '20112'])
    const out = submitRequest(db, r.id, NOW)
    expect(out.mails.map((m) => m.type)).toEqual(['M01', 'M02'])
    expect(r.number).toBe('R2026-0125')
    expect(currentRoundSteps(r).map((s) => s.role)).toEqual(['回覧者1', '回覧者3', '回覧先1', '回覧先2', '回覧先3'])
    let t = NOW
    for (let i = 0; i < 4; i++) {
      const res = approveByToken(db, tokenOf(db, pendingStep(r)!.id), '', (t += 1000))
      expect(res.mails.map((m) => m.type)).toEqual(['M02'])
    }
    const last = approveByToken(db, tokenOf(db, pendingStep(r)!.id), '', (t += 1000))
    expect(last.mails.map((m) => m.type)).toEqual(['M05', 'M06'])
    expect(r.status).toBe('circulated')
  })

  it('使用済みURLは「承認済み」になる', () => {
    const db = buildSeed(NOW)
    const r = newRequest(db)
    submitRequest(db, r.id, NOW)
    const tok = tokenOf(db, pendingStep(r)!.id)
    approveByToken(db, tok, '', NOW + 1)
    expect(checkToken(db, tok, NOW + 2)).toMatchObject({ ok: false, reason: 'approved' })
    expect(checkToken(db, 'nonsense', NOW)).toMatchObject({ ok: false, reason: 'invalid' })
  })

  it('差し戻しはコメント必須で、【日時 役割 氏名】付きで追記し、再依頼で最初からやり直す', () => {
    const db = buildSeed(NOW)
    const r = newRequest(db)
    submitRequest(db, r.id, NOW)
    approveByToken(db, tokenOf(db, pendingStep(r)!.id), '', NOW + 1)
    const tok = tokenOf(db, pendingStep(r)!.id)
    expect(() => returnByToken(db, tok, '  ', NOW + 2)).toThrow()
    const out = returnByToken(db, tok, '寸法を追記してください', NOW + 2)
    expect(out.mails[0].type).toBe('M03')
    expect(r.status).toBe('returned')
    expect(r.returnComments[0]).toMatch(/^【10\/29 10:00 回覧者3 山本】寸法を追記してください$/)
    expect(checkToken(db, tok, NOW + 3)).toMatchObject({ ok: false, reason: 'returned' })
    submitRequest(db, r.id, NOW + 10)
    expect(r.round).toBe(2)
    expect(pendingStep(r)!.role).toBe('回覧者1')
    expect(r.returnComments).toHaveLength(1)
  })

  it('引き戻すと承認待ちのURLが無効になり M04 を送る', () => {
    const db = buildSeed(NOW)
    const r = newRequest(db)
    submitRequest(db, r.id, NOW)
    const tok = tokenOf(db, pendingStep(r)!.id)
    const out = pullBack(db, r.id, NOW + 1)
    expect(out.mails[0].type).toBe('M04')
    expect(r.status).toBe('pulledBack')
    expect(checkToken(db, tok, NOW + 2)).toMatchObject({ ok: false, reason: 'pulledBack' })
  })

  it('代理承認は理由必須。元のURLは無効、M10 の後に次の承認者へ M02', () => {
    const db = buildSeed(NOW)
    const admin = findEmployee(db, '10050')!
    const r = newRequest(db)
    submitRequest(db, r.id, NOW)
    const tok = tokenOf(db, pendingStep(r)!.id)
    expect(() => proxyApprove(db, r.id, admin, '', NOW + 1)).toThrow()
    const out = proxyApprove(db, r.id, admin, '休暇のため', NOW + 1)
    expect(out.mails.map((m) => m.type)).toEqual(['M10', 'M02'])
    expect(checkToken(db, tok, NOW + 2)).toMatchObject({ ok: false, reason: 'proxy' })
    expect(pendingStep(r)!.role).toBe('回覧者3')
  })

  it('再送・承認者の変更で古いURLは使えなくなる', () => {
    const db = buildSeed(NOW)
    const admin = findEmployee(db, '10050')!
    const r = newRequest(db)
    submitRequest(db, r.id, NOW)
    const old = tokenOf(db, pendingStep(r)!.id)
    resendApproval(db, r.id, admin, NOW + 1, '20111')
    expect(pendingStep(r)!.approver.name).toBe('佐藤 一郎')
    expect(checkToken(db, old, NOW + 2)).toMatchObject({ ok: false, reason: 'resent' })
    expect(checkToken(db, tokenOf(db, pendingStep(r)!.id), NOW + 2).ok).toBe(true)
  })

  it('URLは発行から14日で期限切れ', () => {
    const db = buildSeed(NOW)
    const r = newRequest(db)
    submitRequest(db, r.id, NOW)
    const tok = tokenOf(db, pendingStep(r)!.id)
    expect(checkToken(db, tok, NOW + 15 * DAY_MS)).toMatchObject({ ok: false, reason: 'expired' })
  })

  it('自分自身・同じ人は回覧者に選べない', () => {
    const db = buildSeed(NOW)
    const r = newRequest(db)
    r.reviewers = ['20101', null, null]
    expect(() => submitRequest(db, r.id, NOW)).toThrow('自分自身')
    r.reviewers = ['20110', '20110', null]
    expect(() => submitRequest(db, r.id, NOW)).toThrow('同じ人')
  })
})

describe('進捗と成果', () => {
  it('担当者を決めると対応中＋M07、引き渡し完了日で完了＋M11', () => {
    const db = buildSeed(NOW)
    const leader = findEmployee(db, '10123')!
    const r = db.requests.find((x) => x.number === 'R2026-0121')!
    expect(r.status).toBe('circulated')
    const base = {
      assignees: r.assignees, ratios: [] as number[], meetingDone: false, meetingDate: null, estimateDone: false, estimateDate: null,
      purchaseDone: false, purchaseDate: null, progress: 0, productionDate: null, deliveryDate: null, contribution: null,
    }
    const a = saveProgress(db, r.id, leader, { ...base, assignees: ['10245', '10123'], ratios: [50, 50] }, NOW)
    expect(a.mails.map((m) => m.type)).toEqual(['M07', 'M07'])
    expect(r.status).toBe('inProgress')
    const b = saveProgress(db, r.id, leader, { ...base, assignees: ['10245', '10123'], ratios: [50, 50], deliveryDate: '2026-10-29' }, NOW + 1)
    expect(b.mails.map((m) => m.type)).toEqual(['M11'])
    expect(r.status).toBe('done')
  })

  it('打ち合わせ・見積り依頼・買い入れは「済」なら日付が必須、「未」なら日付を持たない', () => {
    const db = buildSeed(NOW)
    const leader = findEmployee(db, '10123')!
    const r = db.requests.find((x) => x.number === 'R2026-0119')!
    const base = {
      assignees: r.assignees, ratios: r.ratios, meetingDone: true, meetingDate: '2026-10-20', estimateDone: true, estimateDate: '2026-10-21',
      purchaseDone: false, purchaseDate: null, progress: r.progress, productionDate: null, deliveryDate: null, contribution: null,
    }
    expect(() => saveProgress(db, r.id, leader, { ...base, meetingDate: null }, NOW)).toThrow('打ち合わせ')
    expect(() => saveProgress(db, r.id, leader, { ...base, purchaseDone: true }, NOW)).toThrow('買い入れ完了日')
    saveProgress(db, r.id, leader, { ...base, purchaseDone: true, purchaseDate: '2026-10-25' }, NOW)
    expect([r.purchaseDone, r.purchaseDate]).toEqual([true, '2026-10-25'])
    saveProgress(db, r.id, leader, { ...base, purchaseDone: false, purchaseDate: '2026-10-25' }, NOW + 1)
    expect([r.purchaseDone, r.purchaseDate]).toEqual([false, null])
  })

  it('一般の設備メンバーは担当していない依頼の買い入れを更新できない', () => {
    const db = buildSeed(NOW)
    const r = db.requests.find((x) => x.number === 'R2026-0115')! // 担当は伊藤
    const sasaki = findEmployee(db, '10245')!
    const ito = findEmployee(db, '10123')!
    expect(canEditField('purchase', sasaki, r)).toBe(false)
    expect(canEditField('meeting', sasaki, r)).toBe(false)
    expect(canEditField('purchase', ito, r)).toBe(true)
  })

  it('従業員番号は数字5桁（社員データCSV）', () => {
    const csv = '従業員番号,氏名,氏名カナ,部署コード,部署名,役職,メールアドレス\n10601,新井 健,アライ ケン,1010,製造一課,担当,arai@example.co.jp\n106012,上田 翔,ウエダ ショウ,1020,製造二課,担当,ueda@example.co.jp'
    const { rows, errors } = parseEmployeeCsv(csv)
    expect(rows.map((r) => r.empNo)).toEqual(['10601'])
    expect(errors[0].message).toContain('数字5桁')
    expect(buildSeed(NOW).employees.every((e) => /^\d{5}$/.test(e.empNo))).toBe(true)
  })

  it('複数人担当の貢献額は配分（％）で分け、端数は最後の人に計上する', () => {
    expect(splitAmount(150000, ['a', 'b'], [60, 40])).toEqual([{ id: 'a', amount: 90000 }, { id: 'b', amount: 60000 }])
    expect(splitAmount(1000, ['a'], [100])).toEqual([{ id: 'a', amount: 1000 }])
    expect(splitAmount(100000, ['a', 'b', 'c'], [34, 33, 33]).map((x) => x.amount)).toEqual([34000, 33000, 33000])
    // 配分が合わないときは均等
    expect(splitAmount(100, ['a', 'b', 'c'], [50, 50]).map((x) => x.amount)).toEqual([34, 33, 33])
    expect(equalRatios(3)).toEqual([34, 33, 33])
    expect(equalRatios(4)).toEqual([25, 25, 25, 25])
  })

  it('担当者は2人以上（5人まで）登録でき、配分の合計は100％', () => {
    const db = buildSeed(NOW)
    const leader = findEmployee(db, '10123')!
    const r = db.requests.find((x) => x.number === 'R2026-0121')!
    const base = {
      assignees: [] as string[], ratios: [] as number[], meetingDone: false, meetingDate: null, estimateDone: false, estimateDate: null,
      purchaseDone: false, purchaseDate: null, progress: 0, productionDate: null, deliveryDate: null, contribution: null,
    }
    const team = ['10123', '10245', '10310', '10501']
    expect(() => saveProgress(db, r.id, leader, { ...base, assignees: team, ratios: [25, 25, 25, 20] }, NOW)).toThrow('合計が100')
    const out = saveProgress(db, r.id, leader, { ...base, assignees: team, ratios: [25, 25, 25, 25] }, NOW)
    expect(out.mails.filter((m) => m.type === 'M07')).toHaveLength(4)
    expect(r.assignees).toEqual(team)
    expect(() => saveProgress(db, r.id, leader, { ...base, assignees: [...team, '10050', '10520'], ratios: [20, 20, 20, 20, 10, 10] }, NOW)).toThrow('5人まで')
    expect(() => saveProgress(db, r.id, leader, { ...base, assignees: ['10123', '10123'], ratios: [50, 50] }, NOW)).toThrow('同じ人')
  })

  it('年度集計に依頼書以外の作業を含める／外す', () => {
    const db = buildSeed(NOW)
    const withOther = contributionRows(db, { kind: 'fy', year: 2026 }, true)
    const withoutOther = contributionRows(db, { kind: 'fy', year: 2026 }, false)
    const ito = (rows: typeof withOther) => rows.find((r) => r.employeeId === '10123')!
    expect(ito(withOther).total).toBeGreaterThan(ito(withoutOther).total)
    expect(ito(withoutOther).otherAmount).toBe(0)
  })

  it('毎朝の処理：2日でリマインド(M12)、3日以上で承認停滞(M09)、納期フォロー(M08)', () => {
    const db = buildSeed(NOW)
    const types = morningBatch(db, NOW).mails.map((m) => m.type)
    expect(types).toContain('M12')
    expect(types).toContain('M09')
    expect(types).toContain('M08')
  })
})
