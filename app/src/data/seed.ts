// サンプルデータ。業務ルールの関数を「過去の時刻」で順に実行して作るので、
// 回覧の記録・承認用URL・メールがすべて本物と同じ形でそろう。日付はアプリ起動日を基準にする。
import type { DB, Employee, WorkRequest } from '../domain/types'
import { DAY_MS, isoDaysFrom } from '../domain/format'
import { createDraft } from '../domain/requests'
import { approveByToken, cancelRequest, pullBack, returnByToken, saveProgress, submitRequest, type ProgressPatch } from '../domain/workflow'
import { createInquiry, postInquiryMessage, resolveInquiry } from '../domain/inquiries'
import { findEmployee, pendingStep, snapOf } from '../domain/rules'
import { newId } from '../domain/ids'
import { cart, cover, jig, plate, stand, readTitleBlock } from './drawings'
import { PHOTOS } from './photos'
import { addHistory } from './history'

const HOUR = 60 * 60 * 1000

type EmpRow = [empNo: string, name: string, kana: string, dept: string, position: string, email: string, roles?: string]

const DEPTS: [id: string, code: string, name: string][] = [
  ['d1010', '1010', '製造一課'],
  ['d1020', '1020', '製造二課'],
  ['d1030', '1030', '品質課'],
  ['d1040', '1040', '物流課'],
  ['d1050', '1050', '生産管理課'],
  ['d1110', '1110', '品質保証課'],
  ['d1120', '1120', '安全衛生課'],
  ['d2010', '2010', '設備課'],
]

const EMPLOYEES: EmpRow[] = [
  ['10050', '小林 誠一', 'コバヤシ セイイチ', 'd2010', '課長', 'kobayashi@example.co.jp', 'equipment,manager'],
  ['10123', '伊藤 次郎', 'イトウ ジロウ', 'd2010', '係長', 'ito@example.co.jp', 'equipment,leader'],
  ['10245', '佐々木 三郎', 'ササキ サブロウ', 'd2010', '主任', 'sasaki@example.co.jp', 'equipment'],
  ['10310', '高橋 四郎', 'タカハシ シロウ', 'd2010', '担当', 'takahashi@example.co.jp', 'equipment,it'],
  ['10402', '中村 五郎', 'ナカムラ ゴロウ', 'd2010', '担当', 'nakamura@example.co.jp', 'equipment'],
  ['10501', '渡辺 六郎', 'ワタナベ ロクロウ', 'd2010', '担当', 'watanabe@example.co.jp', 'equipment'],
  ['10520', '田中 健', 'タナカ ケン', 'd2010', '係長', 'tanaka@example.co.jp'],
  ['20101', '山田 太郎', 'ヤマダ タロウ', 'd1010', '担当', 't-yamada@example.co.jp'],
  ['20110', '木村 一郎', 'キムラ イチロウ', 'd1010', '組長', 'kimura@example.co.jp'],
  ['20111', '佐藤 一郎', 'サトウ イチロウ', 'd1010', '工長', 'sato@example.co.jp'],
  ['20112', '山本 浩', 'ヤマモト ヒロシ', 'd1010', '課長', 'yamamoto@example.co.jp'],
  ['20130', '前田 優', 'マエダ ユウ', 'd1010', '担当', 'maeda@example.co.jp'],
  ['20201', '井上 修', 'イノウエ オサム', 'd1020', '組長', 'inoue@example.co.jp'],
  ['20202', '加藤 誠', 'カトウ マコト', 'd1020', '工長', 'kato@example.co.jp'],
  ['20203', '吉田 明', 'ヨシダ アキラ', 'd1020', '課長', 'yoshida@example.co.jp'],
  ['20220', '森 大輔', 'モリ ダイスケ', 'd1020', '担当', 'mori@example.co.jp'],
  ['20215', '佐藤 花子', 'サトウ ハナコ', 'd1030', '担当', 'h-sato@example.co.jp'],
  ['20301', '松本 進', 'マツモト ススム', 'd1030', '組長', 'matsumoto@example.co.jp'],
  ['20302', '林 守', 'ハヤシ マモル', 'd1030', '課長', 'hayashi@example.co.jp'],
  ['20401', '岡田 修平', 'オカダ シュウヘイ', 'd1040', '組長', 'okada@example.co.jp'],
  ['20402', '清水 隆', 'シミズ タカシ', 'd1040', '課長', 'shimizu@example.co.jp'],
  ['20410', '石井 美穂', 'イシイ ミホ', 'd1040', '担当', 'ishii@example.co.jp'],
  ['20501', '長谷川 亮', 'ハセガワ リョウ', 'd1050', '主任', 'hasegawa@example.co.jp'],
  ['20502', '藤田 直樹', 'フジタ ナオキ', 'd1050', '課長', 'fujita@example.co.jp'],
  ['20510', '小山 真', 'コヤマ マコト', 'd1050', '担当', 'koyama@example.co.jp'],
  ['30101', '鈴木 一郎', 'スズキ イチロウ', 'd1110', '課長', 'suzuki@example.co.jp'],
  ['30201', '高橋 美咲', 'タカハシ ミサキ', 'd1120', '主任', 'm-takahashi@example.co.jp'],
]

/** デモ用パスワード（設備メンバー） */
export const DEMO_PASSWORD = 'demo1234'

const REVIEWERS: Record<string, [string | null, string | null, string | null]> = {
  d1010: ['20110', null, '20112'],
  d1020: ['20201', '20202', '20203'],
  d1030: ['20301', null, '20302'],
  d1040: ['20401', null, '20402'],
  d1050: ['20501', null, '20502'],
}

function baseDB(): DB {
  const employees: Employee[] = EMPLOYEES.map(([empNo, name, kana, deptId, position, email, roles = '']) => {
    const r = roles.split(',')
    const equipment = r.includes('equipment')
    const firstLogin = empNo === '10501'
    return {
      id: empNo, empNo, name, kana, deptId, position, email,
      active: empNo !== '10402',
      roles: { equipment, leader: r.includes('leader'), manager: r.includes('manager'), it: r.includes('it') },
      password: equipment ? (firstLogin ? empNo : DEMO_PASSWORD) : null,
      passwordChanged: equipment && !firstLogin,
      failedCount: 0, lockedUntil: null, lastLoginAt: null,
    }
  })
  return {
    employees,
    departments: DEPTS.map(([id, code, name]) => ({ id, code, name, reviewers: REVIEWERS[id] ?? [null, null, null], active: true })),
    targets: [
      { id: 't1', order: 1, employeeId: '30101', active: true },
      { id: 't2', order: 2, employeeId: '30201', active: true },
      { id: 't3', order: 3, employeeId: '10520', active: true },
    ],
    requests: [], tokens: [], otherWorks: [], inquiries: [], importLogs: [], mails: [],
    seq: { request: 0, inquiry: 0, id: 0 },
  }
}

interface ReqSpec {
  no: number
  by: string
  title: string
  desc: string
  reqOff: number // 依頼日（今日からの日数）
  dueOff: number
  drawings?: ('stand' | 'plate' | 'jig' | 'cover' | 'cart')[]
  photo?: keyof typeof PHOTOS
  /** 送信時刻を直接指定する（経過日数を正確にしたいとき） */
  at?: number
}

const DRAW = { stand, plate, jig, cover, cart }

function makeRequest(db: DB, s: ReqSpec, now: number): WorkRequest {
  const user = findEmployee(db, s.by)!
  const d0 = new Date(now)
  d0.setHours(9, 0, 0, 0)
  const sendAt = s.at ?? d0.getTime() + s.reqOff * DAY_MS + ((s.no * 7) % 50) * 60 * 1000
  const t = sendAt - 40 * 60 * 1000
  const req = createDraft(db, user, t)
  req.title = s.title
  req.description = s.desc
  req.dueDate = isoDaysFrom(now, s.dueOff)
  for (const [i, key] of (s.drawings ?? []).entries()) {
    const json = DRAW[key](isoDaysFrom(t, -1).replace(/-/g, '/'), user.name)
    const tb = readTitleBlock(json)
    req.drawings.push({
      id: newId(db, 'drw'), sheetNo: i + 1, revision: 1, name: tb.name, drawingNo: tb.drawingNo,
      material: tb.material, json, savedBy: user.name, savedAt: t,
    })
  }
  if (s.photo) {
    const p = PHOTOS[s.photo]
    req.attachments.push({ id: newId(db, 'att'), fileName: p.name, kind: 'image', src: p.src, size: p.size })
  }
  db.seq.request = s.no - 1
  submitRequest(db, req.id, sendAt)
  return req
}

/** 承認待ちの人に、時刻 t で承認してもらう */
function approveNext(db: DB, req: WorkRequest, t: number, comment = '') {
  const p = pendingStep(req)!
  const tok = db.tokens.find((x) => x.stepId === p.id && x.status === 'valid')!
  approveByToken(db, tok.token, comment, t)
}

function approveAll(db: DB, req: WorkRequest, from: number) {
  let t = from
  while (req.status === 'circulating') {
    t += 5 * HOUR
    approveNext(db, req, t)
  }
  return t
}

function patchOf(req: WorkRequest, p: Partial<ProgressPatch>): ProgressPatch {
  return {
    assignees: req.assignees, ratios: req.ratios, meetingDone: req.meetingDone, meetingDate: req.meetingDate,
    estimateDone: req.estimateDone, estimateDate: req.estimateDate, purchaseDone: req.purchaseDone,
    purchaseDate: req.purchaseDate, progress: req.progress, productionDate: req.productionDate,
    deliveryDate: req.deliveryDate, contribution: req.contribution, ...p,
  }
}

export function buildSeed(now: number = Date.now()): DB {
  const db = baseDB()
  // 過去1年分の履歴（データ分析・前年度比較用）
  addHistory(db, now)
  const leader = findEmployee(db, '10123')!
  const day = (off: number, h = 10) => {
    const d = new Date(now)
    d.setHours(h, 0, 0, 0)
    return d.getTime() + off * DAY_MS
  }

  // ── 完了した依頼（成果確認の集計用） ──
  const done: [ReqSpec, string[], number[], number, number][] = [
    [{ no: 101, by: '20410', title: 'パレット置き場の区画枠', desc: '物流課 第2倉庫のパレット置き場に、床固定式の区画枠（L型鋼）を設置したい。', reqOff: -215, dueOff: -190 }, ['10123'], [100], 85000, -192],
    [{ no: 102, by: '20101', title: '台車の改造', desc: '既存の平台車のハンドルを延長し、高さ1000mmにしたい。', reqOff: -200, dueOff: -170, drawings: ['cart'] }, ['10123'], [100], 90000, -172],
    [{ no: 103, by: '20220', title: 'スクラップ箱の製作', desc: 'プレス横に置くスクラップ箱（600×400×300）をフォーク差し込み口付きで2台。', reqOff: -185, dueOff: -155 }, ['10123'], [100], 200000, -150],
    [{ no: 104, by: '20215', title: '検査台の改造', desc: '検査台の天板を拡張し、照明スタンドを取り付けられるようにしたい。', reqOff: -170, dueOff: -140 }, ['10245'], [100], 160000, -138],
    [{ no: 105, by: '20510', title: '表示板の取付', desc: '生産ラインの進捗表示板（モニター）を壁面に取り付ける金具の製作。', reqOff: -155, dueOff: -130 }, ['10310'], [100], 80000, -128],
    [{ no: 106, by: '20130', title: 'エアブロー治具の製作', desc: '部品の切粉を除去するエアブロー治具。ノズル4本・足踏みスイッチ式。', reqOff: -140, dueOff: -110, drawings: ['jig'] }, ['10123', '10245'], [60, 40], 250000, -108],
    [{ no: 107, by: '20410', title: '棚の転倒防止金具', desc: '部品棚6台の転倒防止金具を製作・取付。', reqOff: -125, dueOff: -98 }, ['10501'], [100], 90000, -96],
    [{ no: 108, by: '20220', title: 'シュートの改造', desc: '部品シュートの角度を変更（30°→35°）し、詰まりを解消したい。', reqOff: -110, dueOff: -82 }, ['10310'], [100], 140000, -80],
    [{ no: 109, by: '20215', title: 'ゲージ置き台の製作', desc: '限界ゲージ12本を立てて置ける置き台。', reqOff: -95, dueOff: -70 }, ['10245'], [100], 120000, -68],
    [{ no: 110, by: '20410', title: '台車の改造（落下防止枠）', desc: '台車の左側に高さ300mmの落下防止枠を追加したい。', reqOff: -80, dueOff: -55, drawings: ['cart'], photo: 'cart' }, ['10123'], [100], 110000, -52],
    [{ no: 111, by: '20130', title: '作業台の高さ変更', desc: '作業台4台の脚を延長し、高さを850mm→900mmにしたい。', reqOff: -70, dueOff: -48 }, ['10501'], [100], 70000, -46],
    [{ no: 112, by: '20220', title: '安全柵の追加', desc: 'ロボットセル周囲に安全柵（H1800）を追加。扉にインターロック付き。', reqOff: -62, dueOff: -40, drawings: ['cover'] }, ['10123', '10310', '10245'], [40, 30, 30], 300000, -38],
    [{ no: 113, by: '20510', title: '部品トレーの製作', desc: '小物部品用のトレー（仕切り付き）を20個。', reqOff: -50, dueOff: -26 }, ['10245'], [100], 95000, -25],
  ]
  for (const [spec, assignees, ratios, amount, delOff] of done) {
    const req = makeRequest(db, spec, now)
    const t = approveAll(db, req, req.requestDate!)
    saveProgress(db, req.id, leader, patchOf(req, {
      assignees, ratios, meetingDone: true, meetingDate: isoDaysFrom(t, 2), progress: 0,
    }), t + 2 * DAY_MS)
    saveProgress(db, req.id, leader, patchOf(req, {
      estimateDone: true, estimateDate: isoDaysFrom(t, 3), purchaseDone: true, purchaseDate: isoDaysFrom(t, 6),
      progress: 100, productionDate: isoDaysFrom(now, delOff - 1), deliveryDate: isoDaysFrom(now, delOff), contribution: amount,
    }), day(delOff, 16))
  }

  // ── 対応中・見積り依頼待ち：検査用照明の取付（打ち合わせが遅れた） ──
  const r114 = makeRequest(db, {
    no: 114, by: '20215', title: '検査用照明の取付', desc: '外観検査台にLED照明（色温度5000K）を取り付ける金具の製作。照明器具は品質課で手配済み。',
    reqOff: -40, dueOff: 12,
  }, now)
  let t = approveAll(db, r114, r114.requestDate!)
  saveProgress(db, r114.id, leader, patchOf(r114, { assignees: ['10310'], ratios: [100] }), t + DAY_MS)
  saveProgress(db, r114.id, leader, patchOf(r114, { meetingDone: true, meetingDate: isoDaysFrom(now, -3) }), day(-3, 16))

  // ── 対応中・買い入れ待ち：安全カバーの改造（納期超過＝赤） ──
  const r115 = makeRequest(db, {
    no: 115, by: '20220', title: '安全カバーの改造',
    desc: '200tプレス側面の安全カバーが破損。ポリカーボネート板を交換し、扉にインターロックスイッチを追加したい。',
    reqOff: -35, dueOff: -2, drawings: ['cover'], photo: 'cover',
  }, now)
  t = approveAll(db, r115, r115.requestDate!)
  saveProgress(db, r115.id, leader, patchOf(r115, { assignees: ['10123'], ratios: [100], meetingDone: true, meetingDate: isoDaysFrom(t, 1) }), t + DAY_MS)
  // 見積りは済み、部品の買い入れ待ち（納期超過）
  saveProgress(db, r115.id, leader, patchOf(r115, { estimateDone: true, estimateDate: isoDaysFrom(t, 3) }), day(-6))

  // ── 取り下げ ──
  const r116 = makeRequest(db, { no: 116, by: '20130', title: 'ホース掛けの製作', desc: 'エアホースを掛けるフック（壁面取付）を5個。', reqOff: -30, dueOff: 10 }, now)
  cancelRequest(db, r116.id, r116.requester, day(-29, 11))

  // ── 対応中・製作中：検査治具の製作（納期7日以内＝黄、3人担当、版2あり） ──
  const r117 = makeRequest(db, {
    no: 117, by: '20215', title: '検査治具の製作',
    desc: 'ブラケット部品（品番 BK-2210）の穴位置を検査する治具。位置決めピン2本・トグルクランプ2個。1台。',
    reqOff: -27, dueOff: 4, drawings: ['plate', 'jig'], photo: 'jig',
  }, now)
  t = approveAll(db, r117, r117.requestDate!)
  saveProgress(db, r117.id, leader, patchOf(r117, { assignees: ['10245', '10123', '10501'], ratios: [40, 40, 20], meetingDone: true, meetingDate: isoDaysFrom(t, 1) }), t + DAY_MS)
  saveProgress(db, r117.id, leader, patchOf(r117, {
    estimateDone: true, estimateDate: isoDaysFrom(t, 2), purchaseDone: true, purchaseDate: isoDaysFrom(t, 6), progress: 60, contribution: 150000,
  }), day(-3, 15))
  // 設備側が製作用に直した図面（版2）
  const v1 = r117.drawings[0]
  r117.drawings.push({ ...v1, id: newId(db, 'drw'), revision: 2, savedBy: '佐々木 三郎', savedAt: day(-8, 14) })

  // ── 差し戻し中：治具の改造（山田 太郎） ──
  const r118 = makeRequest(db, { no: 118, by: '20101', title: '治具の改造', desc: '溶接治具のクランプ位置を変更したい。', reqOff: -6, dueOff: 15, drawings: ['plate'] }, now)
  approveNext(db, r118, day(-5, 14))
  const p118 = pendingStep(r118)!
  returnByToken(db, db.tokens.find((x) => x.stepId === p118.id && x.status === 'valid')!.token, '寸法を追記してください', day(-3, 10) + 15 * 60 * 1000)

  // ── 対応中・引き渡し待ち：金型置き台の補強（製作完了） ──
  const r119 = makeRequest(db, { no: 119, by: '20220', title: '金型置き台の補強', desc: '金型置き台（2段）の棚板がたわんでいるため、補強リブを追加したい。', reqOff: -16, dueOff: 9 }, now)
  t = approveAll(db, r119, r119.requestDate!)
  saveProgress(db, r119.id, leader, patchOf(r119, { assignees: ['10245'], ratios: [100], meetingDone: true, meetingDate: isoDaysFrom(t, 1) }), t + DAY_MS)
  saveProgress(db, r119.id, findEmployee(db, '10245')!, patchOf(r119, {
    estimateDone: true, estimateDate: isoDaysFrom(t, 2), purchaseDone: true, purchaseDate: isoDaysFrom(t, 5), progress: 100,
    productionDate: isoDaysFrom(now, -1),
  }), day(-1, 17))

  // ── 引き戻し中：測定台の高さ調整 ──
  const r120 = makeRequest(db, { no: 120, by: '20215', title: '測定台の高さ調整', desc: '三次元測定機横の測定台の高さを調整できるようにしたい。', reqOff: -12, dueOff: 20 }, now)
  pullBack(db, r120.id, day(-11, 9))

  // ── 回覧完了（打ち合わせ待ち）：担当者未定 ──
  const r121 = makeRequest(db, { no: 121, by: '20220', title: 'シュート台の製作', desc: '完成品を流すシュート台（長さ1500・傾斜15°）を1台。', reqOff: -4, dueOff: 25 }, now)
  approveAll(db, r121, r121.requestDate!)

  // ── 回覧中：回覧先1で3日止まっている（代理承認のデモ） ──
  const r122 = makeRequest(db, { no: 122, by: '20510', title: '工具棚の製作', desc: '段取り替え用工具を整理する工具棚（W1200×D450×H1800）。扉付き。', reqOff: -5, dueOff: 20 }, now)
  approveNext(db, r122, day(-5, 13))
  approveNext(db, r122, day(-4, 9) - 2 * HOUR)

  // ── 回覧中：回覧者3 山本 課長の承認待ち（メールBOXから承認のデモ） ──
  const r123 = makeRequest(db, {
    no: 123, by: '20101', title: 'Aライン 部品置き台の製作',
    desc: '幅900×奥行600×高さ800、2台。Aライン横に設置。部品箱（600×400）を上下2段に置けるようにしたい。キャスター付き（ストッパー付き）。',
    reqOff: -1, dueOff: 32, drawings: ['stand'], photo: 'lineA',
  }, now)
  approveNext(db, r123, day(-1, 15) + 20 * 60 * 1000)

  // ── 回覧中：回覧者1で2日（リマインドのデモ） ──
  makeRequest(db, { no: 124, by: '20410', title: 'フォークリフト用 車止めの製作', desc: '出荷場のフォークリフト待機位置に車止め（L1000）を2本。床にアンカー固定。', reqOff: -2, dueOff: 40, photo: 'cart', at: now - 2 * DAY_MS - 2 * HOUR }, now)
  db.seq.request = 124

  // ── 依頼書以外の作業 ──
  const ow = (requestOff: number, deptId: string, requesterName: string, assignees: string[], ratios: number[], title: string, progress: number, doneOff: number | null, contribution: number | null) =>
    db.otherWorks.push({
      id: newId(db, 'ow'), requestDate: isoDaysFrom(now, requestOff), deptId, requesterName, assignees, ratios, title, progress,
      completedDate: doneOff === null ? null : isoDaysFrom(now, doneOff), contribution, createdBy: '小林 誠一', createdAt: now + requestOff * DAY_MS,
    })
  ow(-28, 'd1020', '井上 修', ['10123'], [100], '金型の定期点検', 50, null, 50000)
  ow(-34, 'd1040', '岡田 修平', ['10310'], [100], 'コンベア修理', 80, null, 40000)
  ow(-120, 'd1010', '木村 一郎', ['10123'], [100], 'エアー配管の移設', 100, -100, 100000)
  ow(-95, 'd1030', '林 守', ['10245', '10501'], [50, 50], '照明器具の交換', 100, -88, 60000)
  ow(-30, 'd1030', '松本 進', ['10245'], [100], '測定具の定期校正', 100, -15, 40000)
  ow(-60, 'd1050', '藤田 直樹', ['10501'], [100], '棚の移設', 100, -57, 30000)

  // ── 問い合わせ ──
  const emp = (id: string) => findEmployee(db, id)!
  const it = emp('10310')
  db.seq.inquiry = 12
  const q13 = createInquiry(db, emp('10123'), { category: '要望', requestId: null, title: '一覧に列を追加したい', body: '依頼書一覧に「製作完了日」の列があると助かります。', attachmentName: null, visibility: 'public' }, day(-14, 9)).inquiry
  postInquiryMessage(db, q13.id, it, '次回の更新で「製作完了日」の列を追加します。', day(-13, 11))
  resolveInquiry(db, q13.id, day(-13, 15))
  createInquiry(db, emp('20215'), { category: '不具合', requestId: null, title: '承認メールが届かない', body: '課長に承認依頼メールが届いていないようです。迷惑メールフォルダも確認しましたがありませんでした。', attachmentName: null, visibility: 'public' }, day(-1, 16))
  const q15 = createInquiry(db, emp('20101'), { category: '使い方', requestId: r123.id, title: '図面を2枚添付したい', body: '1件の依頼に図面を2枚付けるにはどうすればよいですか。', attachmentName: null, visibility: 'public' }, day(-9, 13)).inquiry
  postInquiryMessage(db, q15.id, it, '製図ページの「＋ 新しい図面」で2枚目を追加できます。1件の依頼に10枚まで保存できます。', day(-9, 14) + 5 * 60 * 1000)
  const q16 = createInquiry(db, emp('10501'), { category: '使い方', requestId: null, title: 'パスワードを忘れた場合', body: 'パスワードを忘れたときはどうすればよいですか。', attachmentName: null, visibility: 'it' }, day(-7, 10)).inquiry
  postInquiryMessage(db, q16.id, it, 'ユーザー管理でパスワードを初期化します（従業員番号に戻ります）。次回ログイン時に新しいパスワードを設定してください。', day(-7, 11))

  // ── 社員データ取り込みの記録 ──
  db.importLogs.push(
    { id: newId(db, 'imp'), at: day(-9, 9) + 15 * 60 * 1000, fileName: '社員一覧_最新.csv', added: 1, updated: 3, deactivated: 0, errors: 0, by: '高橋 四郎' },
    { id: newId(db, 'imp'), at: day(-28, 10) + 2 * 60 * 1000, fileName: '社員一覧_月初.csv', added: 0, updated: 0, deactivated: 1, errors: 0, by: '伊藤 次郎' },
    { id: newId(db, 'imp'), at: day(-41, 15) + 12 * 60 * 1000, fileName: '社員一覧_異動.csv', added: 2, updated: 5, deactivated: 0, errors: 1, by: '高橋 四郎' },
  )

  // 古いメールは整理し、最近のものだけメールBOXに残す（10日以内）。1日以上前は既読
  db.mails = db.mails.filter((m) => m.sentAt >= now - 10 * DAY_MS)
  for (const m of db.mails) m.read = m.sentAt < now - DAY_MS

  // 依頼者の情報は依頼した時点の写し（snapOf）でそろえる
  for (const r of db.requests) r.requester = { ...r.requester, ...snapOf(db, findEmployee(db, r.requester.employeeId)!) }
  return db
}
