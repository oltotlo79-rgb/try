// 画面の行き先（要件「8_画面遷移図」）。S08 は画面の上に重ねるため、ここには無い（EmployeePicker）
export type DrawingMode = 'edit' | 'view' | 'equipment'

export type Route =
  | { s: 'S01' }
  | { s: 'S02' }
  | { s: 'S03'; forced?: boolean }
  | { s: 'S04' }
  | { s: 'S05'; reqId: string }
  | { s: 'S06'; reqId: string; sheet: number; mode: DrawingMode; back: Route; token?: string }
  | { s: 'S07'; reqId: string }
  | { s: 'S09'; reqId: string }
  | { s: 'S10'; filter?: string }
  | { s: 'S11'; reqId: string }
  | { s: 'S12'; token: string }
  | { s: 'S13'; token: string; done?: 'approved' | 'returned'; nextLabel?: string }
  | { s: 'S14'; preset?: 'unassigned' | 'mine' }
  | { s: 'S15'; reqId: string }
  | { s: 'S16' }
  | { s: 'S17' }
  | { s: 'S18'; preset?: 'open' }
  | { s: 'S19' }
  | { s: 'S20'; inqId: string }
  | { s: 'S21' }
  | { s: 'S22' }
  | { s: 'S23' }
  | { s: 'S24' }
  | { s: 'S25' }
  | { s: 'S26' }
  | { s: 'S27'; reqId?: string }
  /** 要件外の追加：データ分析 */
  | { s: 'S28' }

export type ScreenId = Route['s']

/** ログイン不要の画面（承認用URL・ログイン系） */
export const PUBLIC_SCREENS: ScreenId[] = ['S01', 'S02', 'S12', 'S13']

let reqNo: (id: string) => string = (id) => id.replace(/\D/g, '')
/** 依頼書の内部IDから、URLに出す番号（R2026-0123 → 123）を引けるようにする */
export function setRequestNumberResolver(f: (id: string) => string) {
  reqNo = f
}
const num = (id: string) => reqNo(id)

/** 画面上部に表示する擬似URL（要件の画面イメージのアドレス） */
export function routePath(r: Route): string {
  switch (r.s) {
    case 'S01': return '/login'
    case 'S02': return '/login/password'
    case 'S03': return '/password'
    case 'S04': return '/'
    case 'S05': return '/requests/new'
    case 'S06': return `/requests/${num(r.reqId)}/drawings/${r.sheet}`
    case 'S07': return '/requests/new/reviewers'
    case 'S09': return `/requests/${num(r.reqId)}/complete`
    case 'S10': return '/my/requests'
    case 'S11': return `/my/requests/${num(r.reqId)}`
    case 'S12':
    case 'S13': return `/approve/${r.token}`
    case 'S14': return '/requests'
    case 'S15': return `/requests/${num(r.reqId)}`
    case 'S16': return '/progress'
    case 'S17': return '/results'
    case 'S18': return '/inquiries'
    case 'S19': return '/inquiries/new'
    case 'S20': return `/inquiries/${num(r.inqId)}`
    case 'S21': return '/settings'
    case 'S22': return '/settings/users'
    case 'S23': return '/settings/employees'
    case 'S24': return '/settings/circulation'
    case 'S25': return '/settings/departments'
    case 'S26': return '/settings/other-works'
    case 'S27': return r.reqId ? `/settings/requests/${num(r.reqId)}` : '/settings/requests'
    case 'S28': return '/analytics'
  }
}

export const SCREEN_NAME: Record<ScreenId, string> = {
  S01: 'ログイン', S02: 'パスワード入力', S03: 'パスワード設定', S04: 'メニュー', S05: '依頼書入力',
  S06: '製図ページ', S07: '回覧者の入力', S09: '依頼受付完了', S10: '自分の依頼一覧', S11: '依頼の詳細',
  S12: '承認', S13: '処理結果・お知らせ', S14: '依頼書一覧', S15: '依頼書詳細・進捗更新', S16: '作業進捗',
  S17: '成果確認', S18: '問い合わせ一覧', S19: '問い合わせの作成', S20: '問い合わせの詳細・回答',
  S21: '設定メニュー', S22: 'ユーザー管理', S23: '社員データの取り込み', S24: '回覧先の設定',
  S25: '部署・回覧者の設定', S26: '依頼書以外の作業', S27: '依頼書の管理・代理承認', S28: 'データ分析',
}

/** 画面ごとの route の型 */
export type RouteOf<K extends ScreenId> = Extract<Route, { s: K }>
