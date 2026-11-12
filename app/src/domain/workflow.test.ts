import { describe, expect, it } from 'vitest'
import { buildSeed } from '../data/seed'
import type { DB } from './types'
import { createDraft } from './requests'
import { approveByToken, checkToken, morningBatch, proxyApprove, pullBack, resendApproval, returnByToken, saveProgress, submitRequest } from './workflow'
import { canEditField, canUseEquipment, currentRoundSteps, equalRatios, findEmployee, isAdmin, isEquipment, isLeaderPlus, needsPassword, pendingStep, roleLabel, rolesOf } from './rules'
import { applyImport, parseEmployeeCsv, previewImport } from './importer'
import { COST_CENTER_OTHER, costCenterGroup, costCenterGroups, searchCostCenters } from './costCenters'
import { contributionRows, splitAmount } from './stats'
import { DAY_MS } from './format'

const NOW = new Date(2026, 9, 29, 10, 0).getTime()
const tokenOf = (db: DB, stepId: string) => db.tokens.find((t) => t.stepId === stepId && t.status === 'valid')!.token

function newRequest(db: DB) {
  const maeda = findEmployee(db, '20130')! // 製造一課の一般の社員
  const r = createDraft(db, maeda, NOW)
  r.title = 'テスト'
  r.description = '内容'
  r.dueDate = '2026-11-30'
  r.costCenter = { code: '3081', affiliation: 'コプ・製造第一部101工場生産附帯設備' }
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
    const admin = findEmployee(db, '28316')!
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
    const admin = findEmployee(db, '28316')!
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
    r.reviewers = ['20130', null, null]
    expect(() => submitRequest(db, r.id, NOW)).toThrow('自分自身')
    r.reviewers = ['20110', '20110', null]
    expect(() => submitRequest(db, r.id, NOW)).toThrow('同じ人')
  })
})

describe('進捗と成果', () => {
  it('担当者を決めると対応中＋M07、引き渡し完了日で完了＋M11', () => {
    const db = buildSeed(NOW)
    const leader = findEmployee(db, '52035')!
    const r = db.requests.find((x) => x.number === 'R2026-0121')!
    expect(r.status).toBe('circulated')
    const base = {
      assignees: r.assignees, ratios: [] as number[], meetingDone: false, meetingDate: null, estimateDone: false, estimateDate: null,
      purchaseDone: false, purchaseDate: null, progress: 0, productionDate: null, deliveryDate: null, contribution: null,
    }
    const a = saveProgress(db, r.id, leader, { ...base, assignees: ['38660', '52035'], ratios: [50, 50] }, NOW)
    expect(a.mails.map((m) => m.type)).toEqual(['M07', 'M07'])
    expect(r.status).toBe('inProgress')
    const b = saveProgress(db, r.id, leader, { ...base, assignees: ['38660', '52035'], ratios: [50, 50], deliveryDate: '2026-10-29' }, NOW + 1)
    expect(b.mails.map((m) => m.type)).toEqual(['M11'])
    expect(r.status).toBe('done')
  })

  it('打ち合わせ・見積り依頼・買い入れは「済」なら日付が必須、「未」なら日付を持たない', () => {
    const db = buildSeed(NOW)
    const leader = findEmployee(db, '52035')!
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
    const r = db.requests.find((x) => x.number === 'R2026-0115')! // 担当は斎藤（設備班長）
    const nomura = findEmployee(db, '54414')! // 設備メンバー（担当していない）
    const saito = findEmployee(db, '52035')!
    expect(canEditField(db, 'purchase', nomura, r)).toBe(false)
    expect(canEditField(db, 'meeting', nomura, r)).toBe(false)
    expect(canEditField(db, 'purchase', saito, r)).toBe(true)
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
    const leader = findEmployee(db, '52035')!
    const r = db.requests.find((x) => x.number === 'R2026-0121')!
    const base = {
      assignees: [] as string[], ratios: [] as number[], meetingDone: false, meetingDate: null, estimateDone: false, estimateDate: null,
      purchaseDone: false, purchaseDate: null, progress: 0, productionDate: null, deliveryDate: null, contribution: null,
    }
    const team = ['52035', '38660', '54414', '79306']
    expect(() => saveProgress(db, r.id, leader, { ...base, assignees: team, ratios: [25, 25, 25, 20] }, NOW)).toThrow('合計が100')
    const out = saveProgress(db, r.id, leader, { ...base, assignees: team, ratios: [25, 25, 25, 25] }, NOW)
    expect(out.mails.filter((m) => m.type === 'M07')).toHaveLength(4)
    expect(r.assignees).toEqual(team)
    expect(() => saveProgress(db, r.id, leader, { ...base, assignees: [...team, '28316', '22056'], ratios: [20, 20, 20, 20, 10, 10] }, NOW)).toThrow('5人まで')
    expect(() => saveProgress(db, r.id, leader, { ...base, assignees: ['52035', '52035'], ratios: [50, 50] }, NOW)).toThrow('同じ人')
  })

  it('年度集計に依頼書以外の作業を含める／外す', () => {
    const db = buildSeed(NOW)
    const withOther = contributionRows(db, { kind: 'fy', year: 2026 }, true)
    const withoutOther = contributionRows(db, { kind: 'fy', year: 2026 }, false)
    const saito = (rows: typeof withOther) => rows.find((r) => r.employeeId === '52035')!
    expect(saito(withOther).total).toBeGreaterThan(saito(withoutOther).total)
    expect(saito(withoutOther).otherAmount).toBe(0)
  })

  it('毎朝の処理：2日でリマインド(M12)、3日以上で承認停滞(M09)、納期フォロー(M08)', () => {
    const db = buildSeed(NOW)
    const types = morningBatch(db, NOW).mails.map((m) => m.type)
    expect(types).toContain('M12')
    expect(types).toContain('M09')
    expect(types).toContain('M08')
  })
})

describe('権限は所属部署・役職から自動で決まる', () => {
  it('設備係＝設備メンバー、班長＝リーダー（設備班長）、組長・工長・課長＝管理者', () => {
    const db = buildSeed(NOW)
    const label = (id: string) => roleLabel(db, findEmployee(db, id)!)
    expect(label('54414')).toBe('設備メンバー')
    expect(label('79306')).toBe('設備メンバー')
    expect(label('52035')).toBe('設備班長')
    expect(label('38660')).toBe('設備班長')
    expect(label('28316')).toBe('設備組長')
    expect(label('49442')).toBe('設備組長')
    expect(label('22056')).toBe('設備工長')
    expect(label('22668')).toBe('設備課長')
    expect(label('30258')).toBe('IT担当者')
    expect(label('29446')).toBe('一般')
    const r = (id: string) => rolesOf(db, findEmployee(db, id)!)
    expect(r('52035')).toEqual({ equipment: true, leader: true, manager: false, it: false })
    expect(r('22668')).toEqual({ equipment: true, leader: false, manager: true, it: false })
    // 設備係以外の課長・組長は一般の社員
    expect(r('20112')).toEqual({ equipment: false, leader: false, manager: false, it: false })
    expect(r('20110')).toEqual({ equipment: false, leader: false, manager: false, it: false })
  })

  it('IT担当者は設備係でなくても設備側の画面・設定を使え、パスワードでログインする。担当者には選べない', () => {
    const db = buildSeed(NOW)
    const it = findEmployee(db, '30258')!
    expect([isEquipment(db, it), canUseEquipment(db, it), isLeaderPlus(db, it), isAdmin(db, it), needsPassword(db, it)]).toEqual([false, true, true, true, true])
    const tsuruoka = findEmployee(db, '29446')!
    expect([canUseEquipment(db, tsuruoka), needsPassword(db, tsuruoka)]).toEqual([false, false])
    const leader = findEmployee(db, '52035')!
    const r = db.requests.find((x) => x.number === 'R2026-0121')!
    const base = {
      assignees: ['30258'], ratios: [100], meetingDone: false, meetingDate: null, estimateDone: false, estimateDate: null,
      purchaseDone: false, purchaseDate: null, progress: 0, productionDate: null, deliveryDate: null, contribution: null,
    }
    expect(() => saveProgress(db, r.id, leader, base, NOW)).toThrow('設備メンバーから')
  })

  it('社員データの取り込みで設備係へ異動・昇格すると、権限も自動で変わる', () => {
    const db = buildSeed(NOW)
    const head = '従業員番号,氏名,氏名カナ,部署コード,部署名,役職,メールアドレス'
    const rows = db.employees.filter((e) => e.active).map((e) => {
      const d = db.departments.find((x) => x.id === e.deptId)!
      if (e.id === '20410') return `${e.empNo},${e.name},${e.kana},2010,設備係,担当,${e.email}` // 物流課 → 設備係
      if (e.id === '79306') return `${e.empNo},${e.name},${e.kana},${d.code},${d.name},班長,${e.email}` // 担当 → 班長
      return `${e.empNo},${e.name},${e.kana},${d.code},${d.name},${e.position},${e.email}`
    })
    const pv = previewImport(db, [head, ...rows].join('\n'))
    expect(pv.changed.find((c) => c.row.empNo === '20410')!.changes).toContain('権限 一般 → 設備メンバー')
    expect(pv.changed.find((c) => c.row.empNo === '79306')!.changes).toContain('権限 設備メンバー → 設備班長')
    // アプリでは確認後に複製した db へ反映する（store の run）。複製先でも変わることを確かめる
    const next = structuredClone(db)
    applyImport(next, pv, 'test.csv', findEmployee(next, '28316')!, NOW)
    expect(roleLabel(db, findEmployee(db, '20410')!)).toBe('一般') // 元の db はそのまま
    const ishii = findEmployee(next, '20410')!
    expect([roleLabel(next, ishii), needsPassword(next, ishii), ishii.password]).toEqual(['設備メンバー', true, null])
    expect(roleLabel(next, findEmployee(next, '79306')!)).toBe('設備班長')
  })
})

describe('原価センター', () => {
  it('一覧は docs/123.xlsx の原価センター・所属の2列（4,393件・重複なし）', () => {
    const db = buildSeed(NOW)
    expect(db.costCenters).toHaveLength(4393)
    expect(new Set(db.costCenters.map((c) => c.code)).size).toBe(4393)
    expect(db.costCenters[0]).toEqual({ code: '1061', affiliation: '本社･ﾘﾌﾄｴﾝｼﾞﾝ認証費（LF営業関連_引当済)' })
    expect(Object.keys(db.costCenters[0])).toEqual(['code', 'affiliation'])
  })

  it('区分は所属の最初の「・」より前（半角「･」も同じ扱い）。「・」がなければ「その他」', () => {
    expect(costCenterGroup('本社･ﾘﾌﾄｴﾝｼﾞﾝ認証費（LF営業関連_引当済)')).toBe('本社')
    expect(costCenterGroup('LF・安全総務部人事G')).toBe('LF')
    expect(costCenterGroup('電池･共総･203工場･事務所')).toBe('電池')
    expect(costCenterGroup('ＬＦ・品質保証部')).toBe('LF')
    expect(costCenterGroup('監査役')).toBe(COST_CENTER_OTHER)
    const groups = costCenterGroups(buildSeed(NOW).costCenters)
    expect(groups[0]).toEqual({ name: '本社', count: 368 })
    expect(groups.at(-1)!.name).toBe(COST_CENTER_OTHER)
    expect(groups.reduce((a, g) => a + g.count, 0)).toBe(4393)
  })

  it('区分とキーワード（原価センター・所属、全角半角を区別しない）で絞り込める', () => {
    const list = buildSeed(NOW).costCenters
    const honsha = searchCostCenters(list, '本社', '')
    expect(honsha).toHaveLength(368)
    expect(honsha.every((c) => costCenterGroup(c.affiliation) === '本社')).toBe(true)
    expect(searchCostCenters(list, null, '3081').map((c) => c.code)).toEqual(['3081'])
    // 半角カナの所属も全角で探せる
    expect(searchCostCenters(list, '本社', 'リフト').map((c) => c.code)).toContain('1061')
    // 空白区切りはすべてを含む
    const both = searchCostCenters(list, 'LF', '保全 生準')
    expect(both.length).toBeGreaterThan(0)
    expect(both.every((c) => c.affiliation.includes('保全') && c.affiliation.includes('生準'))).toBe(true)
  })

  it('原価センターを選ばないと依頼を送れない。選んだ内容は依頼書に写しで残る', () => {
    const db = buildSeed(NOW)
    const r = newRequest(db)
    r.costCenter = null
    expect(() => submitRequest(db, r.id, NOW)).toThrow('原価センター')
    r.costCenter = { ...db.costCenters.find((c) => c.code === '4431')! }
    submitRequest(db, r.id, NOW)
    expect(r.status).toBe('circulating')
    expect(r.costCenter).toEqual({ code: '4431', affiliation: 'LF・製造部PM室保全課生準G' })
    // サンプルの依頼書にもすべて入っている
    expect(db.requests.every((x) => x.costCenter && db.costCenters.some((c) => c.code === x.costCenter!.code))).toBe(true)
  })
})
