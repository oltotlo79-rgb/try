// S19 問い合わせの作成：使い方の質問・不具合の連絡・要望をIT担当者に送る（送るとIT担当者全員へ M13）
import { useRef, useState } from 'react'
import { ArrowLeft, Bug, Globe2, HelpCircle, Lightbulb, Lock, MoreHorizontal, Paperclip, Send, X } from 'lucide-react'
import type { RouteOf } from '../../router'
import type { InquiryCategory } from '../../domain/types'
import { useApp, useMe } from '../../store'
import { deptName, statusShort } from '../../domain/rules'
import { Avatar, Field, PageHead, Panel } from '../../components/ui'
import './inquiry.css'

const CATEGORIES: { v: InquiryCategory; icon: typeof Bug; desc: string }[] = [
  { v: '使い方', icon: HelpCircle, desc: '操作の方法がわからない' },
  { v: '不具合', icon: Bug, desc: '動きがおかしい・エラーが出る' },
  { v: '要望', icon: Lightbulb, desc: 'こうなると便利' },
  { v: 'その他', icon: MoreHorizontal, desc: '上のどれにも当てはまらない' },
]

export default function S19InquiryNew({ route }: { route: RouteOf<'S19'> }) {
  void route
  const me = useMe()!
  const db = useApp((s) => s.db)
  const go = useApp((s) => s.go)
  const ask = useApp((s) => s.ask)
  const createInquiry = useApp((s) => s.createInquiry)
  const [category, setCategory] = useState<InquiryCategory>('使い方')
  const [requestId, setRequestId] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [attachment, setAttachment] = useState<string | null>(null)
  const [visibility, setVisibility] = useState<'public' | 'it'>('public')
  const [tried, setTried] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const myRequests = db.requests
    .filter((r) => r.requester.employeeId === me.id && r.number)
    .sort((a, b) => b.number.localeCompare(a.number))

  const titleErr = !title.trim() ? '入力してください' : title.length > 100 ? '100文字以内で入力してください' : null
  const bodyErr = !body.trim() ? '入力してください' : null

  const send = async () => {
    setTried(true)
    if (titleErr || bodyErr) return
    const ok = await ask({
      title: '問い合わせを送信しますか？',
      body: 'IT担当者全員にメールでお知らせします。',
      okLabel: '送信する',
    })
    if (!ok) return
    const id = createInquiry({
      category,
      requestId: requestId || null,
      title: title.trim(),
      body: body.trim(),
      attachmentName: attachment,
      visibility,
    })
    if (id) go({ s: 'S20', inqId: id })
  }

  return (
    <div className="page narrow">
      <PageHead
        sid="S19"
        en="NEW INQUIRY"
        title="問い合わせの作成"
        desc="使い方の質問・不具合の連絡・要望をIT担当者に送ります。送るとIT担当者全員にメールで知らせます。"
      />

      <Panel title="問い合わせの内容" sub="＊は必ず入力する項目です">
        <div className="col gap-20">
          <Field label="質問者" auto hint="回答のお知らせは、あなたのメールアドレスに届きます。">
            <div className="row" style={{ padding: '4px 0' }}>
              <Avatar emp={me} size="sm" />
              <span>{deptName(db, me.deptId)}　{me.name}</span>
              <span className="mono small tx-3">{me.email}</span>
            </div>
          </Field>

          <Field label="分類" required>
            <div className="choice-grid">
              {CATEGORIES.map(({ v, icon: Icon, desc }) => (
                <button key={v} type="button" className={`choice ${category === v ? 'on' : ''}`} onClick={() => setCategory(v)}>
                  <Icon />
                  <b>{v}</b>
                  <small>{desc}</small>
                </button>
              ))}
            </div>
          </Field>

          <Field label="関係する依頼" hint="特定の依頼についての質問なら、自分の依頼から選んでください（任意）。">
            <select className="select" value={requestId} onChange={(e) => setRequestId(e.target.value)}>
              <option value="">選ばない</option>
              {myRequests.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.number}　{r.title}（{statusShort(r)}）
                </option>
              ))}
            </select>
          </Field>

          <Field label="件名" required error={tried ? titleErr : null} hint={<span className="mono">{title.length} / 100</span>}>
            <input
              className={`input ${tried && titleErr ? 'invalid' : ''}`}
              placeholder="例）図面を2枚添付したい"
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>

          <Field label="内容" required error={tried ? bodyErr : null}>
            <textarea
              className={`textarea ${tried && bodyErr ? 'invalid' : ''}`}
              rows={7}
              placeholder="例）どの画面で、何をしたら、どうなったか"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </Field>

          <Field label="添付" hint="画面のスクリーンショットなど（画像・PDF、10MBまで・任意）">
            <div className="file-pick">
              <Paperclip size={16} className="tx-3" />
              <span className="name">{attachment ?? 'ファイルが選ばれていません'}</span>
              {attachment && (
                <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setAttachment(null)} aria-label="添付を外す"><X /></button>
              )}
              <button className="btn btn-sm" onClick={() => fileRef.current?.click()}>ファイルを選択</button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,.pdf"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) {
                    if (f.size > 10 * 1024 * 1024) useApp.getState().toast('danger', '10MBを超えるファイルは添付できません')
                    else setAttachment(f.name)
                  }
                  e.target.value = ''
                }}
              />
            </div>
          </Field>

          <Field label="公開範囲" hint="「全員に公開」にすると、よくある質問として他の社員も見られます。">
            <div className="choice-grid two">
              <button type="button" className={`choice ${visibility === 'public' ? 'on' : ''}`} onClick={() => setVisibility('public')}>
                <Globe2 />
                <b>全員に公開</b>
                <small>全社員が一覧で見られる（おすすめ）</small>
              </button>
              <button type="button" className={`choice ${visibility === 'it' ? 'on' : ''}`} onClick={() => setVisibility('it')}>
                <Lock />
                <b>IT担当者だけ</b>
                <small>あなたとIT担当者だけに表示</small>
              </button>
            </div>
          </Field>
        </div>
      </Panel>

      <div className="actionbar">
        <button className="btn btn-lg" onClick={() => go({ s: 'S18' })}><ArrowLeft /> 戻る</button>
        <span className="grow" />
        <span className="small tx-3">送信するとIT担当者全員にメール（M13）で知らせます</span>
        <button className="btn btn-lg btn-primary" onClick={send}><Send /> 送信する</button>
      </div>
    </div>
  )
}
