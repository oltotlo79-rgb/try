// 独自タイトルバー：アプリ名・「システム／メールBOX」の切り替え・デモ操作・ウィンドウ操作
import { useEffect, useRef, useState } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { AlarmClock, BookOpen, Copy, LayoutGrid, Mail, Minus, RotateCcw, Square, Wand2, X } from 'lucide-react'
import { useApp } from '../store'
import { Modal } from './ui'
import icon from '../assets/img/app_icon.png'

const tauri = isTauri()

export function TitleBar() {
  const view = useApp((s) => s.view)
  const setView = useApp((s) => s.setView)
  const unread = useApp((s) => s.db.mails.filter((m) => !m.read).length)
  const [menu, setMenu] = useState(false)
  const [guide, setGuide] = useState(false)
  const [maxed, setMaxed] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!tauri) return
    const w = getCurrentWindow()
    w.isMaximized().then(setMaxed)
    const un = w.onResized(() => w.isMaximized().then(setMaxed))
    return () => {
      un.then((f) => f())
    }
  }, [])
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setMenu(false)
    window.addEventListener('mousedown', h)
    return () => window.removeEventListener('mousedown', h)
  }, [])

  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="titlebar-brand" data-tauri-drag-region>
        <img src={icon} alt="" />
        制作物依頼システム
        <span className="sample-chip">SAMPLE</span>
      </div>
      <div className="viewswitch">
        <button className={view === 'system' ? 'on' : ''} onClick={() => setView('system')}>
          <LayoutGrid size={14} /> システム
        </button>
        <button className={view === 'mailbox' ? 'on' : ''} onClick={() => setView('mailbox')}>
          <Mail size={14} /> メールBOX
          {unread > 0 && <span className="count-pill">{unread}</span>}
        </button>
      </div>
      <div className="titlebar-drag" data-tauri-drag-region />
      <div className="titlebar-tools" ref={ref} style={{ position: 'relative' }}>
        <button className="btn btn-sm btn-ghost" onClick={() => setGuide(true)}>
          <BookOpen /> デモの進め方
        </button>
        <button className="btn btn-sm" onClick={() => setMenu((v) => !v)}>
          <Wand2 /> デモ操作
        </button>
        {menu && (
          <div className="menu-pop">
            <button onClick={() => { setMenu(false); useApp.getState().runMorningBatch() }}>
              <AlarmClock />
              <span>毎朝8:00の自動処理を実行<small>納期フォロー（M08）・承認のリマインド（M12）・承認停滞（M09）を送る</small></span>
            </button>
            <button
              onClick={async () => {
                setMenu(false)
                const ok = await useApp.getState().ask({ title: 'サンプルデータを初期化しますか？', body: '追加・変更した依頼やメールはすべて消え、起動したときの状態に戻ります。', okLabel: '初期化する', tone: 'warn' })
                if (ok) useApp.getState().resetData()
              }}
            >
              <RotateCcw />
              <span>サンプルデータを初期化<small>起動したときの状態に戻す（ログアウトします）</small></span>
            </button>
          </div>
        )}
      </div>
      {tauri ? (
        <div className="winbtns">
          <button className="winbtn" onClick={() => getCurrentWindow().minimize()} aria-label="最小化"><Minus size={16} /></button>
          <button className="winbtn" onClick={() => getCurrentWindow().toggleMaximize()} aria-label="最大化">
            {maxed ? <Copy size={13} /> : <Square size={13} />}
          </button>
          <button className="winbtn close" onClick={() => getCurrentWindow().close()} aria-label="閉じる"><X size={17} /></button>
        </div>
      ) : (
        <div style={{ width: 14 }} />
      )}
      {guide && <DemoGuide onClose={() => setGuide(false)} />}
    </header>
  )
}

const STEPS: [string, string][] = [
  ['依頼する', 'ログイン画面の「山田 太郎（依頼者）」を選んでログイン →「依頼する」で件名・内容・納期を入力 → 製図ページで図面を描いて保存 →「次へ」→ 回覧者を確認して「依頼する」。メール送信のお知らせが出ます。'],
  ['メールで承認する', '画面上部の「メールBOX」→ 回覧者（木村 一郎）の受信箱の【承認のお願い】を開き、URLをクリック → ログインなしで承認画面が開きます。図面を確認して「承認する」。'],
  ['回覧が進む', '次の承認者（回覧者3 → 回覧先1〜3）に自動でメールが届きます。メールBOXで順に承認すると「回覧完了」になります。途中で「差し戻す」と依頼者に戻ります。'],
  ['設備側で進める', 'ログアウトして「伊藤 次郎（リーダー）」でログイン（パスワード demo1234）→ 依頼書一覧。工程の帯（打ち合わせ待ち・見積り依頼待ち・買い入れ待ち・製作中・引き渡し待ち）で絞り込めます。依頼を開いて担当者・打ち合わせ・見積り・買い入れ・進捗を入力して保存。引き渡し完了日を入れると「完了」になります。'],
  ['成果と分析を見る', '「成果確認」で担当者ごとの貢献額を年度・月で比較。「データ分析」（追加提案）では依頼の推移・納期遵守率・リードタイム・承認にかかる時間・担当者の負荷などを過去1年分のデータで分析できます。'],
  ['管理者の操作', '「小林 誠一（管理者）」でログイン →「設定」→「依頼書の管理」で止まっている依頼を代理承認・再送できます。上部の「デモ操作」から毎朝の自動処理も試せます。'],
]

function DemoGuide({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="デモの進め方" icon={<BookOpen />} wide onClose={onClose} foot={<button className="btn btn-primary" onClick={onClose}>閉じる</button>}>
      <p style={{ marginTop: 0 }}>
        このアプリはサンプルです。メールは実際には送らず、画面上部の<b>メールBOX</b>に届きます。データはアプリを閉じると消えます。
      </p>
      <div className="col gap-16 mt-16">
        {STEPS.map(([t, d], i) => (
          <div key={t} className="row top gap-16">
            <span className="track-node" style={{ background: 'var(--cyan-soft)', borderColor: 'var(--cyan-line)', color: 'var(--cyan)', flex: 'none' }}>{i + 1}</span>
            <div>
              <b style={{ color: 'var(--tx-1)' }}>{t}</b>
              <div className="small mt-4">{d}</div>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}
