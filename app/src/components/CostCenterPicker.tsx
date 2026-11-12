// 原価センターの選択（依頼書入力・依頼書の管理）。区分（所属の「・」より前）とキーワードで絞り込んで選ぶ
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight, History, Landmark, Search, X } from 'lucide-react'
import type { CostCenter } from '../domain/types'
import { costCenterGroup, costCenterGroups, searchCostCenters } from '../domain/costCenters'
import { useApp } from '../store'
import { Modal } from './ui'
import './costCenter.css'

const PAGE = 200

/** 入力欄：選んだ原価センターを表示し、押すと選択画面を開く */
export function CostCenterField({
  value, onChange, invalid, recent = [], disabled,
}: {
  value: CostCenter | null
  onChange: (c: CostCenter) => void
  invalid?: boolean
  /** 前回までの依頼で使った原価センター（選択画面の上に出す） */
  recent?: CostCenter[]
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        className={`cc-field ${value ? 'filled' : ''} ${invalid ? 'invalid' : ''}`}
        onClick={() => setOpen(true)}
        disabled={disabled}
      >
        <Landmark className="cc-field-ic" />
        {value ? (
          <>
            <span className="cc-code">{value.code}</span>
            <span className="cc-aff">{value.affiliation}</span>
            <span className="cc-tag">{costCenterGroup(value.affiliation)}</span>
            <span className="cc-change">変更</span>
          </>
        ) : (
          <>
            <span className="cc-placeholder">原価センターを選んでください</span>
            <span className="cc-change">選ぶ <ChevronRight /></span>
          </>
        )}
      </button>
      {open && (
        <CostCenterPicker
          selected={value?.code ?? null}
          recent={recent}
          onPick={(c) => {
            onChange({ ...c })
            setOpen(false)
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

/** 選択画面：区分のボタンで絞り込み、原価センター・所属の一部で検索する */
export function CostCenterPicker({
  selected, recent = [], onPick, onClose,
}: {
  selected: string | null
  recent?: CostCenter[]
  onPick: (c: CostCenter) => void
  onClose: () => void
}) {
  const list = useApp((s) => s.db.costCenters)
  const groups = useMemo(() => costCenterGroups(list), [list])
  const [group, setGroup] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const [active, setActive] = useState(0)
  const results = useMemo(() => searchCostCenters(list, group, q), [list, group, q])
  const shown = results.slice(0, limit)
  const listRef = useRef<HTMLDivElement>(null)

  // 条件を変えたら先頭に戻す
  useEffect(() => {
    setLimit(PAGE)
    setActive(0)
    listRef.current?.scrollTo({ top: 0 })
  }, [group, q])

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, shown.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && shown[active]) {
      e.preventDefault()
      onPick(shown[active])
    }
  }

  const showRecent = recent.length > 0 && !group && !q

  // 入力欄はアニメーション付きの枠の中にあるため、画面全体に重ねるよう body の直下に出す
  return createPortal(
    <Modal
      title="原価センターを選ぶ"
      icon={<Landmark />}
      wide
      onClose={onClose}
      foot={
        <>
          <span className="grow hint">原価センターは社員データの所属部署とは別のデータです。↑↓キーで選び、Enterで決定できます。</span>
          <button className="btn" onClick={onClose}>閉じる</button>
        </>
      }
    >
      <div className="cc-picker">
        <div className="cc-label">区分<span className="tx-4">（所属の「・」より前）</span></div>
        <div className="cc-groups" role="tablist">
          <button type="button" className={group === null ? 'on' : ''} onClick={() => setGroup(null)}>
            すべて<span className="n">{list.length.toLocaleString()}</span>
          </button>
          {groups.map((g) => (
            <button key={g.name} type="button" className={group === g.name ? 'on' : ''} onClick={() => setGroup(g.name)}>
              {g.name}<span className="n">{g.count.toLocaleString()}</span>
            </button>
          ))}
        </div>

        <div className="cc-search">
          <Search />
          <input
            className="input"
            autoFocus
            placeholder="原価センター・所属の一部で検索（例：3081　／　保全　／　製造第一部 物流）"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
          />
          {q && (
            <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label="検索をクリア" onClick={() => setQ('')}>
              <X />
            </button>
          )}
        </div>

        {showRecent && (
          <div className="cc-recent">
            <span className="cc-label"><History size={13} /> 前回までの依頼で使った原価センター</span>
            <div className="row wrap gap-6">
              {recent.map((c) => (
                <button key={c.code} type="button" className="cc-chip" onClick={() => onPick(c)} title={c.affiliation}>
                  <span className="cc-code">{c.code}</span>
                  <span className="cc-aff">{c.affiliation}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="cc-meta">
          <span>
            {group ? <b>{group}</b> : 'すべての区分'}
            {q && <>　「{q}」を含む</>}
            ：<b className="mono">{results.length.toLocaleString()}</b>件
          </span>
          {results.length > shown.length && <span className="tx-3">先頭の{shown.length.toLocaleString()}件を表示中。区分やキーワードで絞り込めます</span>}
        </div>

        <div className="cc-list" ref={listRef} role="listbox" aria-label="原価センター">
          <div className="cc-row head" aria-hidden>
            <span>原価センター</span>
            <span>所属</span>
            <span>区分</span>
            <span />
          </div>
          {shown.map((c, i) => (
            <div
              key={c.code}
              data-i={i}
              role="option"
              aria-selected={c.code === selected}
              className={`cc-row ${i === active ? 'active' : ''} ${c.code === selected ? 'sel' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => onPick(c)}
            >
              <span className="cc-code">{c.code}</span>
              <span className="cc-aff">{c.affiliation}</span>
              <span className="cc-tag">{costCenterGroup(c.affiliation)}</span>
              <span className="cc-go">{c.code === selected ? '選択中' : <>選ぶ <ChevronRight /></>}</span>
            </div>
          ))}
          {!results.length && <div className="cc-empty">条件に合う原価センターがありません</div>}
          {results.length > shown.length && (
            <button type="button" className="btn btn-sm cc-more" onClick={() => setLimit((n) => n + PAGE)}>
              さらに表示（残り{(results.length - shown.length).toLocaleString()}件）
            </button>
          )}
        </div>
      </div>
    </Modal>,
    document.body,
  )
}

/** 詳細画面での表示（原価センター・所属・区分） */
export function CostCenterView({ value }: { value: CostCenter | null }) {
  if (!value) return <span className="tx-3">—</span>
  return (
    <span className="cc-view">
      <span className="cc-code">{value.code}</span>
      <span className="cc-aff">{value.affiliation}</span>
      <span className="cc-tag">{costCenterGroup(value.affiliation)}</span>
    </span>
  )
}

/** その依頼者が前回までの依頼で使った原価センター（新しい順・重複なし） */
export function useRecentCostCenters(employeeId: string, excludeReqId?: string, max = 4): CostCenter[] {
  const requests = useApp((s) => s.db.requests)
  return useMemo(() => {
    const seen = new Set<string>()
    const out: CostCenter[] = []
    const mine = requests
      .filter((r) => r.requester.employeeId === employeeId && r.id !== excludeReqId && r.costCenter && r.status !== 'draft')
      .sort((a, b) => (b.requestDate ?? b.createdAt) - (a.requestDate ?? a.createdAt))
    for (const r of mine) {
      const c = r.costCenter!
      if (seen.has(c.code)) continue
      seen.add(c.code)
      out.push(c)
      if (out.length >= max) break
    }
    return out
  }, [requests, employeeId, excludeReqId, max])
}
