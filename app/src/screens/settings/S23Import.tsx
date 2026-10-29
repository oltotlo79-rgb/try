// S23 社員データの取り込み：人事の社員一覧CSVを取り込み、追加・変更・無効を確認してから反映する
import { useRef, useState } from 'react'
import {
  AlertTriangle, ArrowLeft, ArrowRight, CalendarClock, FileSpreadsheet, FlaskConical, ListChecks, UserMinus, UserPlus, UserRoundPen, Upload, XCircle,
} from 'lucide-react'
import type { RouteOf } from '../../router'
import { useApp, useMe } from '../../store'
import { employeesToCsv, previewImport, type ImportPreview } from '../../domain/importer'
import { deptName, isAdmin } from '../../domain/rules'
import { fmtMDHM } from '../../domain/format'
import { Badge, Empty, PageHead, Panel, Seg } from '../../components/ui'
import './settings-c.css'

type Enc = 'auto' | 'utf-8' | 'shift_jis'
type Tab = 'added' | 'changed' | 'deactivated' | 'errors'

function decode(buf: ArrayBuffer, enc: Enc): string {
  if (enc !== 'auto') return new TextDecoder(enc).decode(buf)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    return new TextDecoder('shift_jis').decode(buf)
  }
}

export default function S23Import({ route }: { route: RouteOf<'S23'> }) {
  void route
  const me = useMe()!
  const db = useApp((s) => s.db)
  const go = useApp((s) => s.go)
  const ask = useApp((s) => s.ask)
  const toast = useApp((s) => s.toast)
  const apply = useApp((s) => s.applyImport)
  const [file, setFile] = useState<{ name: string; buf: ArrayBuffer } | null>(null)
  const [sampleText, setSampleText] = useState<string | null>(null)
  const [enc, setEnc] = useState<Enc>('auto')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [tab, setTab] = useState<Tab>('added')
  const [over, setOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  if (!isAdmin(me)) {
    return (
      <div className="page">
        <PageHead sid="S23" en="EMPLOYEE IMPORT" title="社員データの取り込み" />
        <Panel><Empty title="この画面は管理者・IT担当者だけが使えます" /></Panel>
      </div>
    )
  }

  const fileName = file?.name ?? (sampleText ? '社員一覧_サンプル.csv' : null)

  const pickFile = (f: File | undefined) => {
    if (!f) return
    if (!/\.csv$/i.test(f.name)) {
      toast('danger', 'CSVファイルを選んでください')
      return
    }
    f.arrayBuffer().then((buf) => {
      setFile({ name: f.name, buf })
      setSampleText(null)
      setPreview(null)
    })
  }

  const check = () => {
    let text: string
    if (sampleText) text = sampleText
    else if (file) text = decode(file.buf, enc)
    else {
      toast('warn', 'CSVファイルを選んでください')
      return
    }
    const pv = previewImport(db, text)
    setPreview(pv)
    setTab(pv.added.length ? 'added' : pv.changed.length ? 'changed' : pv.deactivated.length ? 'deactivated' : 'errors')
  }

  /** デモ用：今の社員データから少しだけ変えたCSVを作る */
  const loadSample = () => {
    const active = db.employees.filter((e) => e.active && e.id !== '10520')
    const lines = employeesToCsv(db, active).split('\r\n')
    const edited = lines.map((l) => (l.startsWith('10245,') ? l.replace(/,2010,設備課,/, ',2020,保全課,') : l))
    edited.push('10601,新井 健,アライ ケン,1010,製造一課,担当,arai@example.co.jp')
    edited.push('10602,上田 翔,ウエダ ショウ,1020,製造二課,担当,')
    const text = edited.join('\r\n')
    setFile(null)
    setSampleText(text)
    const pv = previewImport(db, text)
    setPreview(pv)
    setTab('added')
    toast('info', 'サンプルCSVを読み込みました', '追加・異動・退職・エラーを含むデモ用のデータです')
  }

  const doImport = async () => {
    if (!preview || !fileName) return
    const ok = await ask({
      title: '社員データを取り込みますか？',
      body:
        `追加 ${preview.added.length}件・変更 ${preview.changed.length}件・無効 ${preview.deactivated.length}件を反映します。` +
        (preview.errors.length ? `\nエラーの ${preview.errors.length}行は取り込みません。` : '') +
        (preview.warnMassDeactivation ? '\n\n⚠ 無効にする人数が全体の10％以上です。CSVの出力ミスがないか確認してください。' : ''),
      okLabel: '取り込む',
      tone: preview.warnMassDeactivation ? 'warn' : 'primary',
    })
    if (!ok) return
    if (apply(preview, fileName)) {
      setPreview(null)
      setFile(null)
      setSampleText(null)
    }
  }

  const counts = preview
    ? { added: preview.added.length, changed: preview.changed.length, deactivated: preview.deactivated.length, errors: preview.errors.length }
    : null

  return (
    <div className="page wide">
      <PageHead
        sid="S23"
        en="EMPLOYEE DATA IMPORT"
        title="社員データの取り込み"
        desc="全社員の従業員番号・氏名・所属・役職・メールアドレスをCSVで取り込み、最新の状態にします。取り込む前に、何が変わるかを確認できます。"
        actions={<button className="btn" onClick={() => go({ s: 'S21' })}><ArrowLeft /> 設定メニューへ</button>}
      />

      <div className="import-grid">
        <div className="col gap-20">
          <Panel title="CSVファイルを取り込む" icon={<FileSpreadsheet />} sub="形式：従業員番号, 氏名, 氏名カナ, 部署コード, 部署名, 役職, メールアドレス（1行目は見出し）">
            <div
              className={`drop ${over ? 'over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setOver(true) }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); pickFile(e.dataTransfer.files?.[0]) }}
            >
              <span className="drop-ic"><Upload /></span>
              <div className="grow">
                <b>{fileName ?? 'CSVファイルをここに落とすか、選んでください'}</b>
                <div className="small tx-3">{fileName ? (sampleText ? 'デモ用のサンプルCSV' : `${Math.round((file?.buf.byteLength ?? 0) / 102.4) / 10}KB`) : '人事から出力した社員一覧のCSV'}</div>
              </div>
              <button className="btn" onClick={() => fileRef.current?.click()}>ファイルを選択</button>
              <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = '' }} />
            </div>
            <div className="row gap-16 mt-16 wrap">
              <span className="label">文字コード</span>
              <Seg<Enc> value={enc} onChange={setEnc} options={[['auto', '自動判定'], ['utf-8', 'UTF-8'], ['shift_jis', 'Shift_JIS']]} />
              <span className="hint">文字化けするときに指定します</span>
              <span className="grow" />
              <button className="btn btn-ghost" onClick={loadSample}><FlaskConical /> サンプルCSVで試す</button>
              <button className="btn btn-primary" disabled={!fileName} onClick={check}><ListChecks /> 内容を確認する</button>
            </div>
          </Panel>

          <Panel
            title="取り込み前の確認"
            icon={<ListChecks />}
            sub="この時点ではまだ反映していません。エラーの行は取り込みません。"
            actions={preview && <button className="btn btn-violet" onClick={doImport}>取り込む <ArrowRight /></button>}
          >
            {!preview || !counts ? (
              <Empty title="CSVを選んで「内容を確認する」を押してください" desc="追加・変更・無効にする社員とエラーの件数を表示します。" />
            ) : (
              <div className="col gap-16">
                {preview.warnMassDeactivation && (
                  <div className="notice danger">
                    <AlertTriangle />
                    <div>
                      <b>無効にする人数がいつもより多くなっています（全体の10％以上）。</b>
                      <br />
                      CSVの出力ミスで在籍者が抜けていないか、人事に確認してから取り込んでください。
                    </div>
                  </div>
                )}
                <div className="sum-cards">
                  <button className="sum-card add" style={{ textAlign: 'left', cursor: 'pointer', color: 'inherit' }} onClick={() => setTab('added')}>
                    <span><UserPlus /> 追加（新しい社員）</span>
                    <b>{counts.added}<small>件</small></b>
                  </button>
                  <button className="sum-card chg" style={{ textAlign: 'left', cursor: 'pointer', color: 'inherit' }} onClick={() => setTab('changed')}>
                    <span><UserRoundPen /> 変更（異動など）</span>
                    <b>{counts.changed}<small>件</small></b>
                  </button>
                  <button className="sum-card off" style={{ textAlign: 'left', cursor: 'pointer', color: 'inherit' }} onClick={() => setTab('deactivated')}>
                    <span><UserMinus /> 無効にする（CSVにいない）</span>
                    <b>{counts.deactivated}<small>件</small></b>
                  </button>
                  <button className="sum-card err" style={{ textAlign: 'left', cursor: 'pointer', color: 'inherit' }} onClick={() => setTab('errors')}>
                    <span><XCircle /> エラー（取り込まない）</span>
                    <b>{counts.errors}<small>件</small></b>
                  </button>
                </div>

                <div>
                  <div className="tabs" style={{ marginBottom: 6 }}>
                    {([['added', '追加'], ['changed', '変更'], ['deactivated', '無効'], ['errors', 'エラー']] as [Tab, string][]).map(([k, label]) => (
                      <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
                        {label}<span className="mono tiny tx-3">{counts[k]}</span>
                      </button>
                    ))}
                  </div>
                  <div className="diff-list">
                    {tab === 'added' && (preview.added.length ? preview.added.map((r) => (
                      <div key={r.empNo} className="diff-row">
                        <span className="id-cell">{r.empNo}</span>
                        <b>{r.name}</b>
                        <span className="tx-2">{r.deptName}　{r.position || '—'}　<span className="mono tiny tx-3">{r.email}</span></span>
                      </div>
                    )) : <p className="tx-3 small">追加する社員はいません</p>)}
                    {tab === 'changed' && (preview.changed.length ? preview.changed.map((c) => (
                      <div key={c.row.empNo} className="diff-row">
                        <span className="id-cell">{c.row.empNo}</span>
                        <b>{c.row.name}</b>
                        <span className="row gap-6 wrap">
                          {c.changes.map((t) => <Badge key={t} tone="info" sm>{t}</Badge>)}
                        </span>
                      </div>
                    )) : <p className="tx-3 small">変更はありません</p>)}
                    {tab === 'deactivated' && (preview.deactivated.length ? preview.deactivated.map((e) => (
                      <div key={e.id} className="diff-row">
                        <span className="id-cell">{e.empNo}</span>
                        <b>{e.name}</b>
                        <span className="tx-2">{deptName(db, e.deptId)}　→ <Badge tone="warn" sm>無効</Badge>
                          <span className="tiny tx-3" style={{ marginLeft: 8 }}>ログインできなくなります（過去の依頼や実績は残ります）</span></span>
                      </div>
                    )) : <p className="tx-3 small">無効にする社員はいません</p>)}
                    {tab === 'errors' && (preview.errors.length ? preview.errors.map((e) => (
                      <div key={e.line} className="diff-row">
                        <span className="mono tx-danger">{e.line}行目</span>
                        <Badge tone="danger" sm>取り込まない</Badge>
                        <span className="tx-2">{e.message.replace(/^\d+行目：/, '')}</span>
                      </div>
                    )) : <p className="tx-3 small">エラーはありません</p>)}
                  </div>
                </div>
              </div>
            )}
          </Panel>
        </div>

        <div className="col gap-20">
          <Panel title="取り込むタイミング" icon={<CalendarClock />}>
            <div className="timing">
              <CalendarClock />
              <div className="small tx-2">
                入社・退職・異動があったときに、人事から最新の社員一覧CSVを受け取り、<b className="tx-1">管理者・IT担当者</b>が取り込みます。
              </div>
            </div>
            <hr className="divider" />
            <ul className="small tx-2" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9 }}>
              <li>CSVにいなくなった社員は削除せず「無効」にします。</li>
              <li>権限とパスワードは、取り込み直しても変わりません。</li>
              <li>回覧者だった社員が無効になると、その部署の回覧者欄は空欄になります。</li>
            </ul>
          </Panel>

          <Panel tight title="取り込みの記録" sub="いつ・どのファイルで・何件変わったか">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>日時</th><th>ファイル</th><th>結果</th><th>実行者</th></tr>
                </thead>
                <tbody>
                  {db.importLogs.map((l) => (
                    <tr key={l.id}>
                      <td className="mono small nowrap">{fmtMDHM(l.at)}</td>
                      <td className="small" style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.fileName}>{l.fileName}</td>
                      <td className="tiny tx-2" style={{ lineHeight: 1.6 }}>
                        追加{l.added}・変更{l.updated}
                        <br />
                        無効{l.deactivated}・<span className={l.errors ? 'tx-danger' : ''}>エラー{l.errors}</span>
                      </td>
                      <td className="small nowrap">{l.by.split(/[\s　]/)[0]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}
