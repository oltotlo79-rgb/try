// アプリ全体の状態（メモリ上のみ。再起動でサンプルデータに戻る）
import { create } from 'zustand'
import type { DB, Employee, Mail, OtherWork, Roles, WorkRequest } from './domain/types'
import { setRequestNumberResolver, type Route } from './router'
import { buildSeed } from './data/seed'
import { createDraft } from './domain/requests'
import {
  RuleError, approveByToken, cancelRequest, morningBatch, proxyApprove, pullBack, resendApproval, returnByToken,
  saveProgress, submitRequest, type Outcome, type ProgressPatch,
} from './domain/workflow'
import { canViewInquiry, createInquiry, postInquiryMessage, resolveInquiry, type NewInquiry } from './domain/inquiries'
import { applyImport, type ImportPreview } from './domain/importer'
import { findEmployee, isAdmin, isEquipment, snapOf, MAX_DRAWINGS } from './domain/rules'
import { newId } from './domain/ids'
import { readTitleBlock, validateDrawingJson } from './data/drawings'

export type ToastKind = 'ok' | 'info' | 'warn' | 'danger' | 'mail'
export interface Toast {
  id: number
  kind: ToastKind
  title: string
  body?: string
  mails?: Mail[]
}

export interface AskOptions {
  title: string
  body?: string
  okLabel?: string
  cancelLabel?: string
  tone?: 'primary' | 'danger' | 'warn' | 'ok'
}

interface AskState extends AskOptions {
  resolve: (ok: boolean) => void
}

const SESSION_MS = 60 * 60 * 1000
let toastSeq = 0

interface State {
  db: DB
  userId: string | null
  /** S01 で入力した従業員番号（S02 で使う） */
  loginEmpNo: string | null
  /** メールのURLから来たとき、ログイン画面にあらかじめ入れておく従業員番号（デモ用） */
  loginPrefill: string | null
  /** ログイン後に開く画面（メールのURLから来たとき） */
  afterLogin: Route | null
  route: Route
  view: 'system' | 'mailbox'
  toasts: Toast[]
  asking: AskState | null
  lastActivity: number
  mailBox: string // 'all' または社員ID
  mailId: string | null

  go: (r: Route) => void
  setView: (v: 'system' | 'mailbox') => void
  toast: (kind: ToastKind, title: string, body?: string) => void
  dismissToast: (id: number) => void
  ask: (o: AskOptions) => Promise<boolean>

  loginStep1: (empNo: string) => string | null
  loginStep2: (password: string) => string | null
  changePassword: (current: string, next: string, confirm: string) => string | null
  logout: (message?: string) => void

  /** 業務ルールを実行し、エラーならトースト、メールが出たら「送信しました」を表示 */
  run: (fn: (db: DB, now: number, me: Employee | null) => Outcome | void, okTitle?: string) => boolean

  newDraft: () => void
  saveDraft: (reqId: string, patch: Partial<WorkRequest>) => void
  discardDraft: (reqId: string) => void
  submit: (reqId: string) => boolean
  pullBack: (reqId: string) => boolean
  cancelByRequester: (reqId: string) => boolean
  saveDrawing: (reqId: string, sheetNo: number | null, json: string, asNewRevision: boolean) => { sheetNo: number; revision: number } | null

  approve: (token: string, comment: string) => boolean
  returnRequest: (token: string, comment: string) => boolean

  saveProgress: (reqId: string, patch: ProgressPatch) => boolean
  proxyApprove: (reqId: string, reason: string) => boolean
  resend: (reqId: string, newApproverId?: string) => boolean
  adminCancel: (reqId: string) => boolean
  adminEditRequest: (reqId: string, patch: Partial<Pick<WorkRequest, 'title' | 'description' | 'dueDate'>>) => boolean

  setRoles: (empId: string, roles: Roles) => boolean
  resetPassword: (empId: string) => boolean
  applyImport: (pv: ImportPreview, fileName: string) => boolean
  addTarget: (employeeId: string, active: boolean) => boolean
  updateTarget: (id: string, patch: { employeeId?: string; active?: boolean }) => boolean
  moveTarget: (id: string, dir: -1 | 1) => void
  deleteTarget: (id: string) => boolean
  setDeptReviewers: (deptId: string, reviewers: [string | null, string | null, string | null]) => boolean
  upsertOtherWork: (w: Omit<OtherWork, 'id' | 'createdBy' | 'createdAt'> & { id?: string }) => boolean
  deleteOtherWork: (id: string) => boolean

  createInquiry: (f: NewInquiry) => string | null
  postInquiry: (inqId: string, body: string) => boolean
  resolveInquiry: (inqId: string) => boolean

  selectMailBox: (box: string) => void
  openMail: (mailId: string) => void
  openMailLink: (mail: Mail) => void
  runMorningBatch: () => void
  resetData: () => void
}

export const useApp = create<State>((set, get) => {
  const me = () => findEmployee(get().db, get().userId)

  function mailToast(mails: Mail[]) {
    if (!mails.length) return
    const id = ++toastSeq
    set((s) => ({ toasts: [...s.toasts, { id, kind: 'mail', title: 'メールが送信されました', mails }] }))
    setTimeout(() => get().dismissToast(id), 9000)
  }

  const run: State['run'] = (fn, okTitle) => {
    const db = structuredClone(get().db)
    try {
      const out = fn(db, Date.now(), findEmployee(db, get().userId) ?? null)
      set({ db })
      if (okTitle) get().toast('ok', okTitle)
      if (out && out.mails.length) mailToast(out.mails)
      return true
    } catch (e) {
      if (e instanceof RuleError || e instanceof Error) get().toast('danger', e.message)
      return false
    }
  }

  return {
    db: buildSeed(),
    userId: null,
    loginEmpNo: null,
    loginPrefill: null,
    afterLogin: null,
    route: { s: 'S01' },
    view: 'system',
    toasts: [],
    asking: null,
    lastActivity: Date.now(),
    mailBox: 'all',
    mailId: null,

    go: (r) => {
      const s = get()
      // 60分操作がないと自動でログアウトする（F06）
      if (s.userId && Date.now() - s.lastActivity > SESSION_MS && !['S12', 'S13'].includes(r.s)) {
        get().logout('60分操作がなかったため、自動でログアウトしました')
        return
      }
      set({ route: r, lastActivity: Date.now(), view: 'system' })
    },
    setView: (v) => set({ view: v }),
    toast: (kind, title, body) => {
      const id = ++toastSeq
      set((s) => ({ toasts: [...s.toasts, { id, kind, title, body }] }))
      setTimeout(() => get().dismissToast(id), kind === 'danger' ? 6000 : 4200)
    },
    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    ask: (o) =>
      new Promise<boolean>((resolve) => {
        set({
          asking: {
            ...o,
            resolve: (ok) => {
              set({ asking: null })
              resolve(ok)
            },
          },
        })
      }),

    // ── ログイン（S01〜S03） ──
    loginStep1: (empNo) => {
      const no = empNo.trim()
      if (!no) return '従業員番号を入力してください'
      if (!/^\d{5}$/.test(no)) return '従業員番号は数字5桁で入力してください'
      const e = get().db.employees.find((x) => x.empNo === no)
      if (!e) return 'この従業員番号は登録されていません'
      if (!e.active) return 'この従業員番号は無効になっています（退職など）'
      if (isEquipment(e)) {
        set({ loginEmpNo: no, route: { s: 'S02' } })
        return null
      }
      completeLogin(e.id)
      return null
    },
    loginStep2: (password) => {
      const db = structuredClone(get().db)
      const e = db.employees.find((x) => x.empNo === get().loginEmpNo)
      if (!e) return '従業員番号の入力からやり直してください'
      const now = Date.now()
      if (e.lockedUntil && e.lockedUntil > now) {
        const min = Math.ceil((e.lockedUntil - now) / 60000)
        return `パスワードを5回続けて間違えたため、あと${min}分間ログインできません`
      }
      if (password !== e.password) {
        e.failedCount += 1
        let msg = `パスワードが違います。あと${Math.max(0, 5 - e.failedCount)}回間違えると15分間ログインできなくなります。`
        if (e.failedCount >= 5) {
          e.lockedUntil = now + 15 * 60 * 1000
          e.failedCount = 0
          msg = 'パスワードを5回続けて間違えたため、15分間ログインできません'
        }
        set({ db })
        return msg
      }
      e.failedCount = 0
      e.lockedUntil = null
      set({ db })
      if (!e.passwordChanged) {
        set({ userId: e.id, route: { s: 'S03', forced: true }, lastActivity: now })
        return null
      }
      completeLogin(e.id)
      return null
    },
    changePassword: (current, next, confirm) => {
      const u = me()
      if (!u) return 'ログインしてください'
      if (current !== u.password) return '現在のパスワードが違います'
      if (next.length < 8 || !/[A-Za-z]/.test(next) || !/\d/.test(next)) return '8文字以上で、英字と数字を両方含めてください'
      if (next === u.empNo) return '従業員番号と同じものは使えません'
      if (next !== confirm) return '確認用のパスワードが一致しません'
      const db = structuredClone(get().db)
      const e = db.employees.find((x) => x.id === u.id)!
      e.password = next
      e.passwordChanged = true
      set({ db })
      get().toast('ok', 'パスワードを設定しました')
      const after = get().afterLogin
      set({ route: after ?? { s: 'S04' }, afterLogin: null })
      return null
    },
    logout: (message) => {
      set({ userId: null, loginEmpNo: null, route: { s: 'S01' }, view: 'system' })
      if (message) get().toast('info', message)
    },

    run,

    // ── 依頼者 ──
    newDraft: () => {
      let id = ''
      run((db, now, u) => {
        id = createDraft(db, u!, now).id
      })
      if (id) get().go({ s: 'S05', reqId: id })
    },
    saveDraft: (reqId, patch) => {
      run((db) => {
        const r = db.requests.find((x) => x.id === reqId)!
        Object.assign(r, patch)
      })
    },
    discardDraft: (reqId) => {
      const db = get().db
      const r = db.requests.find((x) => x.id === reqId)
      if (r?.status === 'draft' && !r.number) set({ db: { ...db, requests: db.requests.filter((x) => x.id !== reqId) } })
    },
    submit: (reqId) => run((db, now) => submitRequest(db, reqId, now)),
    pullBack: (reqId) => run((db, now) => pullBack(db, reqId, now), '依頼を引き戻しました。内容を編集できます'),
    cancelByRequester: (reqId) =>
      run((db, now, u) => cancelRequest(db, reqId, snapOf(db, u!), now), '依頼を取り下げました'),
    saveDrawing: (reqId, sheetNo, json, asNewRevision) => {
      const err = validateDrawingJson(json)
      if (err) {
        get().toast('danger', err)
        return null
      }
      let result: { sheetNo: number; revision: number } | null = null
      const ok = run((db, now, u) => {
        const r = db.requests.find((x) => x.id === reqId)!
        const tb = readTitleBlock(json)
        const sheets = [...new Set(r.drawings.map((d) => d.sheetNo))]
        let no = sheetNo
        if (no === null) {
          if (sheets.length >= MAX_DRAWINGS) throw new RuleError(`図面は1件の依頼に${MAX_DRAWINGS}枚までです`)
          no = (sheets.length ? Math.max(...sheets) : 0) + 1
        }
        const sameSheet = r.drawings.filter((d) => d.sheetNo === no)
        const latest = sameSheet.sort((a, b) => b.revision - a.revision)[0]
        const base = { name: tb.name, drawingNo: tb.drawingNo, material: tb.material, json, savedBy: u!.name, savedAt: now }
        if (latest && !asNewRevision) {
          // 依頼者の原図（版1）の上書き
          Object.assign(latest, base)
          result = { sheetNo: no, revision: latest.revision }
        } else {
          const revision = latest ? latest.revision + 1 : 1
          r.drawings.push({ id: newId(db, 'drw'), sheetNo: no, revision, ...base })
          result = { sheetNo: no, revision }
        }
        // 件名が空欄なら表題欄の図名を入れる
        if (!r.title.trim() && tb.name && r.status !== 'circulating') r.title = tb.name
      })
      return ok ? result : null
    },

    // ── 承認者（S12） ──
    approve: (token, comment) => run((db, now) => approveByToken(db, token, comment, now)),
    returnRequest: (token, comment) => run((db, now) => returnByToken(db, token, comment, now)),

    // ── 設備メンバー ──
    saveProgress: (reqId, patch) => run((db, now, u) => saveProgress(db, reqId, u!, patch, now), '保存しました'),

    // ── 管理者・IT担当者 ──
    proxyApprove: (reqId, reason) => run((db, now, u) => proxyApprove(db, reqId, u!, reason, now), '代理で承認しました'),
    resend: (reqId, newApproverId) => run((db, now, u) => resendApproval(db, reqId, u!, now, newApproverId)),
    adminCancel: (reqId) => run((db, now, u) => cancelRequest(db, reqId, snapOf(db, u!), now), '取り下げにしました'),
    adminEditRequest: (reqId, patch) =>
      run((db, now, u) => {
        const r = db.requests.find((x) => x.id === reqId)!
        Object.assign(r, patch)
        r.history.push({ at: now, actor: u!.name, action: '依頼書を編集（管理者）' })
      }, '保存しました'),
    setRoles: (empId, roles) =>
      run((db, _now, u) => {
        const e = db.employees.find((x) => x.id === empId)!
        if (u && u.id === empId && ((u.roles.manager && !roles.manager) || (u.roles.it && !roles.it)))
          throw new RuleError('自分自身の管理者・IT担当者権限は外せません')
        const becameEquipment = !e.roles.equipment && roles.equipment
        e.roles = roles
        if (becameEquipment && !e.password) {
          e.password = e.empNo
          e.passwordChanged = false
        }
      }, '権限を保存しました'),
    resetPassword: (empId) =>
      run((db) => {
        const e = db.employees.find((x) => x.id === empId)!
        e.password = e.empNo
        e.passwordChanged = false
        e.failedCount = 0
        e.lockedUntil = null
      }, 'パスワードを初期化しました（従業員番号に戻りました）'),
    applyImport: (pv, fileName) => run((db, now, u) => applyImport(db, pv, fileName, u!, now), '社員データを取り込みました'),
    addTarget: (employeeId, active) =>
      run((db) => {
        if (db.targets.some((t) => t.employeeId === employeeId)) throw new RuleError('すでに回覧先に登録されています')
        db.targets.push({ id: newId(db, 't'), order: db.targets.length + 1, employeeId, active })
      }, '回覧先を追加しました'),
    updateTarget: (id, patch) =>
      run((db) => {
        const t = db.targets.find((x) => x.id === id)!
        Object.assign(t, patch)
      }, '保存しました'),
    moveTarget: (id, dir) => {
      run((db) => {
        const list = [...db.targets].sort((a, b) => a.order - b.order)
        const i = list.findIndex((t) => t.id === id)
        const j = i + dir
        if (j < 0 || j >= list.length) return
        ;[list[i], list[j]] = [list[j], list[i]]
        list.forEach((t, k) => (t.order = k + 1))
        db.targets = list
      })
    },
    deleteTarget: (id) =>
      run((db) => {
        db.targets = db.targets.filter((t) => t.id !== id).sort((a, b) => a.order - b.order)
        db.targets.forEach((t, k) => (t.order = k + 1))
      }, '削除しました'),
    setDeptReviewers: (deptId, reviewers) =>
      run((db) => {
        const ids = reviewers.filter(Boolean)
        if (new Set(ids).size !== ids.length) throw new RuleError('同じ人を2回は設定できません')
        db.departments.find((d) => d.id === deptId)!.reviewers = reviewers
      }, '保存しました'),
    upsertOtherWork: (w) =>
      run((db, now, u) => {
        if (!w.title.trim()) throw new RuleError('作業内容を入力してください')
        if (!w.assignees[0]) throw new RuleError('担当者を選んでください')
        if (w.id) {
          Object.assign(db.otherWorks.find((x) => x.id === w.id)!, w)
        } else {
          db.otherWorks.unshift({ ...w, id: newId(db, 'ow'), createdBy: u!.name, createdAt: now })
        }
      }, w.id ? '保存しました' : '登録しました'),
    deleteOtherWork: (id) =>
      run((db) => {
        db.otherWorks = db.otherWorks.filter((x) => x.id !== id)
      }, '削除しました'),

    // ── 問い合わせ ──
    createInquiry: (f) => {
      let id: string | null = null
      run((db, now, u) => {
        const r = createInquiry(db, u!, f, now)
        id = r.inquiry.id
        return r
      })
      return id
    },
    postInquiry: (inqId, body) => run((db, now, u) => postInquiryMessage(db, inqId, u!, body, now)),
    resolveInquiry: (inqId) => run((db, now) => resolveInquiry(db, inqId, now), '解決にしました'),

    // ── メールBOX ──
    selectMailBox: (box) => set({ mailBox: box, mailId: null }),
    openMail: (mailId) => {
      const db = get().db
      set({ mailId, db: { ...db, mails: db.mails.map((m) => (m.id === mailId && !m.read ? { ...m, read: true } : m)) } })
    },
    openMailLink: (mail) => {
      const link = mail.link
      if (!link) return
      const t = link.target
      if (t.screen === 'S12') {
        // 承認用URLはログイン不要。承認者のブラウザで開いた想定
        set({ view: 'system', route: { s: 'S12', token: t.token } })
        return
      }
      const target: Route =
        t.screen === 'S11' ? { s: 'S11', reqId: t.requestId }
        : t.screen === 'S15' ? { s: 'S15', reqId: t.requestId }
        : t.screen === 'S20' ? { s: 'S20', inqId: t.inquiryId }
        : { s: 'S27', reqId: t.requestId }
      const db = get().db
      const u = me()
      const ok =
        !!u &&
        (target.s === 'S11' ? db.requests.find((r) => r.id === target.reqId)?.requester.employeeId === u.id
          : target.s === 'S15' ? isEquipment(u)
          : target.s === 'S27' ? isAdmin(u)
          : canViewInquiry(db.inquiries.find((q) => q.id === (target as { inqId: string }).inqId)!, u))
      if (ok) {
        set({ view: 'system' })
        get().go(target)
        return
      }
      // ログイン画面を経由して該当の画面を表示する（要件 10_メール通知 ※）
      const box = get().mailBox
      const who = mail.to.find((r) => r.employeeId === box) ?? mail.to[0]
      set({
        view: 'system', userId: null, loginEmpNo: null, route: { s: 'S01' }, afterLogin: target,
        loginPrefill: findEmployee(db, who.employeeId)?.empNo ?? null,
      })
      get().toast('info', 'ログインすると、メールの画面が開きます', `${who.name} さんの従業員番号を入れてあります（デモ）`)
    },
    runMorningBatch: () => {
      const db = structuredClone(get().db)
      const out = morningBatch(db, Date.now())
      set({ db })
      if (out.mails.length) mailToast(out.mails)
      else get().toast('info', '毎朝の自動処理を実行しました', '送るメールはありませんでした')
    },
    resetData: () => {
      set({
        db: buildSeed(), userId: null, loginEmpNo: null, afterLogin: null, route: { s: 'S01' }, view: 'system',
        mailBox: 'all', mailId: null,
      })
      get().toast('ok', 'サンプルデータを初期状態に戻しました')
    },
  }

  function completeLogin(id: string) {
    const db = structuredClone(get().db)
    const e = db.employees.find((x) => x.id === id)!
    e.lastLoginAt = Date.now()
    const after = get().afterLogin
    set({ db, userId: id, route: after ?? { s: 'S04' }, afterLogin: null, loginPrefill: null, lastActivity: Date.now() })
  }
})

setRequestNumberResolver((id) => {
  const r = useApp.getState().db.requests.find((x) => x.id === id)
  return r?.number ? String(Number(r.number.slice(-4))) : 'new'
})

/** ログイン中の社員 */
export function useMe(): Employee | null {
  return useApp((s) => findEmployee(s.db, s.userId) ?? null)
}

export function useRequest(id: string | undefined): WorkRequest | undefined {
  return useApp((s) => s.db.requests.find((r) => r.id === id))
}
