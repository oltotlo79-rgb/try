// 原価センター（依頼書で選ぶ費用の負担先）。社員データの所属部署とは対応しない別のデータ
import type { CostCenter } from './types'

/** 所属に「・」がないときの区分 */
export const COST_CENTER_OTHER = 'その他'

/** 表の形式（1行目は見出し「原価センター<TAB>所属」）の文字から一覧を作る */
export function parseCostCenters(tsv: string): CostCenter[] {
  const list: CostCenter[] = []
  for (const line of tsv.split(/\r?\n/).slice(1)) {
    const [code, affiliation] = line.split('\t')
    if (code?.trim()) list.push({ code: code.trim(), affiliation: (affiliation ?? '').trim() })
  }
  return list
}

/** 全角・半角の違いをそろえる（「･」「ﾘﾌﾄ」「ＬＦ」も「・」「リフト」「LF」として扱う） */
const norm = (s: string) => s.normalize('NFKC')

/** 区分＝所属の最初の「・」より前の文字（例：本社・LF・エン）。「・」がなければ「その他」 */
export function costCenterGroup(affiliation: string): string {
  const n = norm(affiliation)
  const i = n.indexOf('・')
  return i > 0 ? n.slice(0, i) : COST_CENTER_OTHER
}

/** 区分と件数。一覧に出てくる順（その他は最後） */
export function costCenterGroups(list: CostCenter[]): { name: string; count: number }[] {
  const m = new Map<string, number>()
  for (const c of list) {
    const g = costCenterGroup(c.affiliation)
    m.set(g, (m.get(g) ?? 0) + 1)
  }
  const groups = [...m].map(([name, count]) => ({ name, count }))
  return [...groups.filter((g) => g.name !== COST_CENTER_OTHER), ...groups.filter((g) => g.name === COST_CENTER_OTHER)]
}

/**
 * 区分とキーワードで絞り込む。キーワードは原価センター・所属のどちらかに含まれていればよく、
 * 空白で区切ると「すべてを含む」になる。全角・半角、英字の大文字・小文字は区別しない
 */
export function searchCostCenters(list: CostCenter[], group: string | null, query: string): CostCenter[] {
  const words = norm(query).toLowerCase().split(/\s+/).filter(Boolean)
  return list.filter((c) => {
    if (group && costCenterGroup(c.affiliation) !== group) return false
    if (!words.length) return true
    const hay = `${c.code} ${norm(c.affiliation)}`.toLowerCase()
    return words.every((w) => hay.includes(w))
  })
}

export function findCostCenter(list: CostCenter[], code: string): CostCenter | undefined {
  return list.find((c) => c.code === code)
}

/** 画面・CSVに出す表記（例：3081　コプ・製造第一部101工場生産附帯設備） */
export function costCenterLabel(c: CostCenter | null | undefined): string {
  return c ? `${c.code}　${c.affiliation}` : '—'
}
