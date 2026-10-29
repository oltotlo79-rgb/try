// 社員データ（CSV）の取り込み（S23）。列：従業員番号,氏名,氏名カナ,部署コード,部署名,役職,メールアドレス
import type { DB, Employee } from './types'
import { newId } from './ids'

export interface CsvEmployee {
  line: number
  empNo: string
  name: string
  kana: string
  deptCode: string
  deptName: string
  position: string
  email: string
}

export interface ImportPreview {
  added: CsvEmployee[]
  changed: { row: CsvEmployee; before: Employee; changes: string[] }[]
  deactivated: Employee[]
  errors: { line: number; message: string }[]
  /** 無効にする人数が全体の10％以上（CSVの出力ミスの疑い） */
  warnMassDeactivation: boolean
}

function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ } else if (c === '"') q = false
      else cur += c
    } else if (c === '"') q = true
    else if (c === ',') { out.push(cur); cur = '' } else cur += c
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

export function parseEmployeeCsv(text: string): { rows: CsvEmployee[]; errors: { line: number; message: string }[] } {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/)
  const rows: CsvEmployee[] = []
  const errors: { line: number; message: string }[] = []
  lines.forEach((raw, i) => {
    if (i === 0 || !raw.trim()) return // 1行目は見出し
    const [empNo, name, kana, deptCode, deptName, position, email] = splitCsvLine(raw)
    const line = i + 1
    if (!empNo || !/^\d{5}$/.test(empNo)) return errors.push({ line, message: `${line}行目：従業員番号は数字5桁で入力してください` })
    if (!name) return errors.push({ line, message: `${line}行目：氏名が空欄` })
    if (!deptCode || !deptName) return errors.push({ line, message: `${line}行目：部署が空欄` })
    if (!email) return errors.push({ line, message: `${line}行目：メールアドレスが空欄` })
    rows.push({ line, empNo, name, kana: kana ?? '', deptCode, deptName, position: position ?? '', email })
  })
  return { rows, errors }
}

export function previewImport(db: DB, text: string): ImportPreview {
  const { rows, errors } = parseEmployeeCsv(text)
  const byNo = new Map(db.employees.map((e) => [e.empNo, e]))
  const deptByCode = new Map(db.departments.map((d) => [d.code, d]))
  const seen = new Set<string>()
  const added: CsvEmployee[] = []
  const changed: ImportPreview['changed'] = []
  for (const r of rows) {
    seen.add(r.empNo)
    const cur = byNo.get(r.empNo)
    if (!cur) { added.push(r); continue }
    const changes: string[] = []
    const curDept = db.departments.find((d) => d.id === cur.deptId)
    if (curDept?.code !== r.deptCode) changes.push(`${curDept?.name ?? '—'} → ${deptByCode.get(r.deptCode)?.name ?? r.deptName}`)
    if (cur.name !== r.name) changes.push(`氏名 ${cur.name} → ${r.name}`)
    if (cur.position !== r.position) changes.push(`役職 ${cur.position || '—'} → ${r.position || '—'}`)
    if (cur.email !== r.email) changes.push(`メール ${cur.email} → ${r.email}`)
    if (!cur.active) changes.push('無効 → 有効')
    if (changes.length) changes.length && changed.push({ row: r, before: cur, changes })
  }
  const deactivated = db.employees.filter((e) => e.active && !seen.has(e.empNo))
  const activeCount = db.employees.filter((e) => e.active).length || 1
  return { added, changed, deactivated, errors, warnMassDeactivation: deactivated.length / activeCount >= 0.1 }
}

/** 確認した内容を反映する。権限とパスワードは変えない */
export function applyImport(db: DB, pv: ImportPreview, fileName: string, by: Employee, now: number) {
  const deptFor = (code: string, name: string) => {
    let d = db.departments.find((x) => x.code === code)
    if (!d) {
      d = { id: newId(db, 'dept'), code, name, reviewers: [null, null, null], active: true }
      db.departments.push(d)
    }
    return d
  }
  for (const r of pv.added) {
    db.employees.push({
      id: r.empNo, empNo: r.empNo, name: r.name, kana: r.kana, deptId: deptFor(r.deptCode, r.deptName).id,
      position: r.position, email: r.email, active: true,
      roles: { equipment: false, leader: false, manager: false, it: false },
      password: null, passwordChanged: false, failedCount: 0, lockedUntil: null, lastLoginAt: null,
    })
  }
  for (const c of pv.changed) {
    const e = c.before
    e.name = c.row.name
    e.kana = c.row.kana
    e.deptId = deptFor(c.row.deptCode, c.row.deptName).id
    e.position = c.row.position
    e.email = c.row.email
    e.active = true
  }
  for (const e of pv.deactivated) {
    e.active = false
    // 回覧者に設定されていた部署の欄は空欄にする（要件 S25 補足）
    for (const d of db.departments) d.reviewers = d.reviewers.map((x) => (x === e.id ? null : x)) as typeof d.reviewers
  }
  db.importLogs.unshift({
    id: newId(db, 'imp'), at: now, fileName, added: pv.added.length, updated: pv.changed.length,
    deactivated: pv.deactivated.length, errors: pv.errors.length, by: by.name,
  })
}

/** 現在の社員データをCSVにする（「サンプルCSVで試す」用） */
export function employeesToCsv(db: DB, employees: Employee[]): string {
  const head = '従業員番号,氏名,氏名カナ,部署コード,部署名,役職,メールアドレス'
  const lines = employees.map((e) => {
    const d = db.departments.find((x) => x.id === e.deptId)
    return [e.empNo, e.name, e.kana, d?.code ?? '', d?.name ?? '', e.position, e.email].join(',')
  })
  return [head, ...lines].join('\r\n')
}
