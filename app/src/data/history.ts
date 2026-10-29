// 過去の依頼の履歴（データ分析・成果確認の前年度比較用）。乱数の種を固定して毎回同じ内容を作る。
// 依頼番号は年ごとの連番（2025年10〜12月：R2025-0236〜、2026年1〜3月：R2026-0086〜）
import type { DB, Employee, InquiryCategory } from '../domain/types'
import { DAY_MS, isoDaysFrom, toISODate } from '../domain/format'
import { createDraft } from '../domain/requests'
import { approveByToken, proxyApprove, returnByToken, saveProgress, submitRequest, type ProgressPatch } from '../domain/workflow'
import { findEmployee, pendingStep } from '../domain/rules'
import { createInquiry, postInquiryMessage, resolveInquiry } from '../domain/inquiries'
import { newId } from '../domain/ids'

const HOUR = 60 * 60 * 1000

/** 種を固定した乱数（mulberry32） */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const TITLES: Record<string, [string, string][]> = {
  '20101': [['工具置き台の製作', '作業台横に置く工具置き台（W500）。'], ['ワーク受け台の改造', '受け台の高さを50mm上げたい。'], ['部品棚の仕切り追加', '部品棚に仕切り板を8枚追加。']],
  '20130': [['ホースリールの取付', '壁面にホースリールを取り付ける金具。'], ['作業台の補強', '作業台の天板のたわみを補強。'], ['手押し台車の製作', '小物運搬用の台車を1台。']],
  '20220': [['金型搬送台車の製作', '小型金型を運ぶ台車（耐荷重200kg）。'], ['プレス安全柵の延長', '安全柵を1.5m延長。'], ['シュートの角度調整', 'シュートを角度可変にしたい。']],
  '20215': [['測定治具の製作', '外径を測る簡易測定治具。'], ['検査台の照明カバー', '照明のまぶしさを抑えるカバー。'], ['限界ゲージ置き台', 'ゲージ10本を置ける台。']],
  '20410': [['パレットストッパー', '出荷場のパレット位置決めストッパー。'], ['台車の車輪交換', '台車4台の車輪をウレタンに交換。'], ['ラベル貼り台の製作', '出荷ラベルを貼る作業台。']],
  '20510': [['掲示板の取付', '生産計画を貼る掲示板の取付。'], ['書類棚の製作', 'ライン横に置く書類棚。'], ['看板スタンドの製作', '品番表示用の看板スタンド。']],
}
const REQUESTERS = Object.keys(TITLES)
const MEMBERS = ['10123', '10245', '10310', '10501']
const RETURN_REASONS = [
  '寸法を追記してください',
  '設置場所の写真を添付してください',
  '数量と納期の根拠を記入してください',
  '安全面の確認（角の面取り）を図面に追記してください',
  '既存品で代用できないか確認してください',
]

export function addHistory(db: DB, now: number) {
  const r = rng(20261029)
  const between = (a: number, b: number) => a + r() * (b - a)
  const int = (a: number, b: number) => Math.floor(between(a, b + 1))
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)]
  const leader = findEmployee(db, '10123')!
  const admin = findEmployee(db, '10050')!
  const dayStart = (off: number) => {
    const d = new Date(now)
    d.setHours(0, 0, 0, 0)
    return d.getTime() + off * DAY_MS
  }

  // 依頼日（-395日〜-222日）を30件
  const offsets = Array.from({ length: 30 }, () => int(-395, -222)).sort((a, b) => a - b)
  const seq: Record<number, number> = { 2025: 235, 2026: 85 }
  for (const off of offsets) {
    const by = pick(REQUESTERS)
    const user = findEmployee(db, by) as Employee
    const [title, desc] = pick(TITLES[by])
    const sendAt = dayStart(off) + between(8.5, 11) * HOUR
    const req = createDraft(db, user, sendAt - 30 * 60 * 1000)
    req.title = title
    req.description = desc
    req.dueDate = isoDaysFrom(sendAt, int(26, 50))
    const year = new Date(sendAt).getFullYear()
    seq[year] = (seq[year] ?? 0) + 1
    db.seq.request = seq[year] - 1
    submitRequest(db, req.id, sendAt)

    // 回覧：承認にかかる時間はばらつく（ときどき長く止まる・差し戻し・代理承認）
    let t = sendAt
    let returned = false
    // 差し戻しは依頼の15％程度・どの段階で起きるかもばらつく
    const returnAt = r() < 0.15 ? int(1, 5) : -1
    let stepNo = 0
    while (req.status === 'circulating') {
      stepNo += 1
      const p = pendingStep(req)!
      const slow = r() < 0.12
      t += (slow ? between(26, 70) : between(0.5, 9)) * HOUR
      const tok = db.tokens.find((x) => x.stepId === p.id && x.status === 'valid')!
      if (!returned && stepNo === returnAt) {
        returnByToken(db, tok.token, pick(RETURN_REASONS), t)
        returned = true
        t += between(20, 60) * HOUR
        submitRequest(db, req.id, t)
        continue
      }
      if (slow && r() < 0.35) proxyApprove(db, req.id, admin, '承認者が出張のため（管理者が内容を確認）', t)
      else approveByToken(db, tok.token, '', t)
    }

    // 担当者の決定 → 打ち合わせ・見積り・買い入れ → 製作 → 引き渡し
    // 1人が多く、ときどき2〜3人で担当する
    const people = r() < 0.7 ? 1 : r() < 0.75 ? 2 : 3
    const team = [...MEMBERS].sort(() => r() - 0.5).slice(0, people)
    const ratios = people === 1 ? [100] : people === 2 ? (() => { const x = pick([50, 60, 70]); return [x, 100 - x] })() : [40, 30, 30]
    const base: ProgressPatch = {
      assignees: team, ratios, meetingDone: false, meetingDate: null,
      estimateDone: false, estimateDate: null, purchaseDone: false, purchaseDate: null, progress: 0,
      productionDate: null, deliveryDate: null, contribution: null,
    }
    const tAssign = t + between(0.5, 3) * DAY_MS
    saveProgress(db, req.id, leader, { ...base, meetingDone: true, meetingDate: isoDaysFrom(tAssign, 0) }, tAssign)
    // 引き渡しは担当者決定の6〜30日後（納期に間に合わないこともある）
    const delivery = Math.min(tAssign + int(6, 30) * DAY_MS, now - 30 * DAY_MS)
    saveProgress(db, req.id, leader, {
      ...base,
      meetingDone: true, meetingDate: isoDaysFrom(tAssign, 0),
      estimateDone: true, estimateDate: isoDaysFrom(tAssign, int(1, 4)),
      purchaseDone: true, purchaseDate: isoDaysFrom(tAssign, int(4, 10)),
      progress: 100, productionDate: toISODate(delivery - int(1, 2) * DAY_MS), deliveryDate: toISODate(delivery),
      contribution: Math.round(between(40000, 320000) / 5000) * 5000,
    }, delivery + 15 * HOUR)
  }
  db.seq.request = 0

  // 依頼書以外の作業（過去分）
  const works: [number, string, string, string, number][] = [
    [-380, 'd1020', '金型の定期点検（上期）', '10123', 60000],
    [-350, 'd1040', 'フォークリフト充電器の移設', '10310', 45000],
    [-330, 'd1010', 'エアー漏れの修理', '10245', 30000],
    [-300, 'd1030', '三次元測定機の架台調整', '10501', 50000],
    [-280, 'd1050', '事務所の棚の移設', '10501', 20000],
    [-255, 'd1020', '金型の定期点検（下期）', '10123', 60000],
    [-240, 'd1040', 'コンベアのベルト交換', '10310', 70000],
  ]
  for (const [off, deptId, title, who, amount] of works) {
    db.otherWorks.push({
      id: newId(db, 'ow'), requestDate: isoDaysFrom(now, off), deptId, requesterName: '—', assignees: [who], ratios: [100],
      title, progress: 100, completedDate: isoDaysFrom(now, off + int(2, 12)), contribution: amount, createdBy: '小林 誠一',
      createdAt: dayStart(off),
    })
  }

  // 問い合わせ（過去分）
  const it = findEmployee(db, '10310')!
  const inq: [number, string, InquiryCategory, string, string, number][] = [
    [-200, '20101', '使い方', '回覧者を変更したい', '回覧者を選び直す方法を教えてください。', 3],
    [-170, '20410', '不具合', '図面の文字が小さく表示される', '承認画面の図面の文字が小さく読みにくいです。', 26],
    [-140, '20220', '要望', '依頼の複製機能がほしい', '似た依頼を何度も出すので複製できると便利です。', 8],
    [-90, '20510', '使い方', '補足資料にPDFを付けたい', 'PDFは添付できますか。', 1.5],
    [-60, '20130', 'その他', '設備課への連絡先', '急ぎの相談の連絡先を知りたいです。', 4],
    [-35, '20215', '不具合', 'CSVが文字化けする', '依頼書一覧のCSVをExcelで開くと文字化けします。', 18],
  ]
  for (const [off, who, cat, title, body, hours] of inq) {
    const at = dayStart(off) + 10 * HOUR
    const q = createInquiry(db, findEmployee(db, who)!, { category: cat, requestId: null, title, body, attachmentName: null, visibility: 'public' }, at).inquiry
    postInquiryMessage(db, q.id, it, '確認しました。手順をご案内します（サンプルの回答です）。', at + hours * HOUR)
    resolveInquiry(db, q.id, at + (hours + 5) * HOUR)
  }
}
