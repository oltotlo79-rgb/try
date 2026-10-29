// 依頼書の作成（S05）。依頼日・依頼部署・依頼者・メールアドレスは社員データから自動で入る
import type { DB, Employee, WorkRequest } from './types'
import { newId } from './ids'
import { snapOf } from './rules'

/** 自部署に設定された回覧者1〜3（S25）。いなくなった人・自分自身は空欄 */
export function defaultReviewers(db: DB, user: Employee): WorkRequest['reviewers'] {
  const dept = db.departments.find((d) => d.id === user.deptId)
  if (!dept) return [null, null, null]
  return dept.reviewers.map((id) => {
    const e = db.employees.find((x) => x.id === id)
    return e && e.active && e.id !== user.id ? e.id : null
  }) as WorkRequest['reviewers']
}

export function createDraft(db: DB, user: Employee, now: number): WorkRequest {
  const req: WorkRequest = {
    id: newId(db, 'req'),
    number: '',
    requestDate: null,
    createdAt: now,
    requester: snapOf(db, user),
    title: '',
    description: '',
    dueDate: '',
    drawings: [],
    attachments: [],
    reviewers: defaultReviewers(db, user),
    returnComments: [],
    status: 'draft',
    round: 0,
    steps: [],
    assignees: [],
    ratios: [],
    meetingDone: false,
    meetingDate: null,
    estimateDone: false,
    estimateDate: null,
    purchaseDone: false,
    purchaseDate: null,
    progress: 0,
    productionDate: null,
    deliveryDate: null,
    contribution: null,
    cancelledAt: null,
    history: [],
  }
  db.requests.push(req)
  return req
}
