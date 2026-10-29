// ファイル保存（CSV出力・JSONで保存）。デスクトップアプリでは保存ダイアログ、ブラウザではダウンロード
import { invoke, isTauri } from '@tauri-apps/api/core'
import { useApp } from '../store'

export async function saveTextFile(defaultName: string, content: string, kind: 'csv' | 'json'): Promise<boolean> {
  const toast = useApp.getState().toast
  try {
    if (isTauri()) {
      const name = await invoke<string | null>('save_text_file', {
        defaultName,
        content,
        bom: kind === 'csv',
        filterName: kind === 'csv' ? 'CSV（Excelで開けます）' : '製図ツールの図面（JSON）',
        extensions: [kind],
      })
      if (!name) return false
      toast('ok', `「${name}」を保存しました`)
      return true
    }
    const blob = new Blob([kind === 'csv' ? '﻿' + content : content], { type: kind === 'csv' ? 'text/csv' : 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = defaultName
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    toast('ok', `「${defaultName}」を保存しました`)
    return true
  } catch (e) {
    toast('danger', '保存できませんでした', String(e))
    return false
  }
}

/** 表をCSV文字列にする（カンマ・改行・ダブルクォートを含む値は囲む） */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((r) =>
      r
        .map((v) => {
          const s = v === null || v === undefined ? '' : String(v)
          return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
        })
        .join(','),
    )
    .join('\r\n')
}
