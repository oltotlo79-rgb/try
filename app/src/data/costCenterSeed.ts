// 原価センターの一覧（docs/123.xlsx の「原価センタ」「テキスト」列。テキスト列は「所属」と呼ぶ）と、
// サンプルの依頼書に入れる原価センター。原価センターは社員の所属部署とは対応しないため、
// サンプルでは依頼部署ごとに「ありそうな」ものを選んでいるだけ（自動で決まる仕組みではない）
import raw from './costCenters.tsv?raw'
import type { CostCenter, DB } from '../domain/types'
import { findCostCenter, parseCostCenters } from '../domain/costCenters'

export const COST_CENTERS: CostCenter[] = parseCostCenters(raw)

const SAMPLE_BY_DEPT: Record<string, string[]> = {
  d1010: ['3081', '3082', '3037'], // 製造一課
  d1020: ['3085', '3101'], // 製造二課
  d1030: ['3701', '4871'], // 品質課
  d1040: ['3060', '3070'], // 物流課
  d1050: ['3724', '3725'], // 生産管理課
  d1110: ['4872', '3701'], // 品質保証課
  d1120: ['4051', '3961'], // 安全衛生G
  d1130: ['4951'], // 情報システムG
  d2010: ['4431', '3020'], // 設備係
}

/** サンプルの依頼書に入れる原価センター（n で候補を順に使い分ける） */
export function sampleCostCenter(db: DB, deptId: string, n: number): CostCenter {
  const codes = SAMPLE_BY_DEPT[deptId] ?? ['3081']
  const c = findCostCenter(db.costCenters, codes[Math.abs(n) % codes.length]) ?? db.costCenters[0]
  return { ...c }
}
