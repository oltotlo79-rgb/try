# 制作物依頼システム サンプルアプリ 設計書

- 作成日: 2026-10-29
- 元資料: `docs/要件定義書_工作依頼システム_第1.2版.xlsx`（アプリ名は「制作物依頼システム」に変更）
- 目的: 上司に提示するモック。全27画面＋メールBOXを実際に操作できる単一EXEのデスクトップアプリ

## 1. 前提・制約

| 項目 | 決定 |
|---|---|
| 形態 | Tauri 2 の単一EXE（WebView2 は Windows 11 標準） |
| 画面 | React 18 + TypeScript + Vite。データはメモリ上のみ（再起動で初期状態） |
| メール | 実際には送らない。アプリ内のメールBOXに届け、送信時に「メールが送信されました（サンプルのため実際には送信されていません）」と表示 |
| 製図ページ | `C:\Users\oltot\Documents\git-projects\CAD\dist\seizu.html` を **コピーのみ**（原本・コピーとも中身は変更しない）。iframe で組み込み、外側から操作する |
| 画像 | Codex CLI `-m gpt-6.1-sol` で生成（Astra 禁止）。WebP に変換して同梱 |
| デザイン | 要件定義書の見た目は再現しない。ダークで精密機器のような高品質UI |

## 2. 全体構成

```
app/
  package.json, vite.config.ts, index.html
  public/seizu/seizu.html        … 製図ツールのコピー（無変更）
  src/
    main.tsx, App.tsx            … 画面切り替え（システム / メールBOX）・ルーター
    styles/                      … デザイントークン・共通CSS
    assets/img/                  … 生成画像（webp）
    domain/                      … 型・状態・業務ルール（純粋関数、vitestでテスト）
      types.ts, rules.ts, workflow.ts, mails.ts, drawing.ts, format.ts
    data/seed.ts, data/drawings.ts … サンプルデータ
    store/store.ts               … zustand。ドメイン関数を呼んで状態更新・メール発行
    components/                  … AppShell, TitleBar, StatusBadge, ApprovalTrack, DrawingThumb, EmployeePicker(S08) …
    screens/                     … S01〜S27, Mailbox, Drawing(S06)
  src-tauri/                     … Rust。ファイル保存ダイアログのコマンドのみ
```

### ルーティング
- 状態として `route = { screen: 'S05', params }` を持つ自前ルーター。上部に「https://seisaku.example.local/…」の擬似URLを表示。
- 未ログインで S11/S15/S20 宛てのURLを開いた場合はログイン後に該当画面へ（要件 10_メール通知 ※）。
- S12/S13 はログイン不要（承認用URL）。

### 画面上部の切り替え（デモ用ドック）
- 「制作物依頼システム」「メールBOX（未読数）」のタブ。
- デモメニュー: 「毎朝8:00の自動処理を実行」（M08/M09/M12 を発生）、「データを初期化」。

## 3. データモデル（要件 11_データ項目 を簡略化）

- `Employee`: id, empNo, name, kana, deptId, position, email, active, roles{equipment, leader, manager, it}, password, passwordChanged, failedCount, lockedUntil
- `Department`: id, code, name, reviewers[3]（employeeId | null）
- `CirculationTarget`: id, order, employeeId, active
- `WorkRequest`: id, number(R2026-xxxx), requestDate, requester snapshot, title, description, dueDate, drawings[], attachments[], reviewers[3], returnComments[], status, round, steps[], assignees[2], ratio1, meeting/estimate/purchase flags+dates, progress, productionDate, deliveryDate, contribution, cancelledAt, history[]
- `ApprovalStep`: round, order, role(回覧者1/2/3/回覧先n), approver snapshot, result(待機中/承認待ち/承認/差し戻し/代理承認/取り消し), comment, actedAt, proxy{by, reason}, sentAt
- `ApprovalToken`: token, requestId, stepIndex, issuedAt, expiresAt, status(有効/使用済み/無効), invalidReason
- `Drawing`: sheetNo, revision, json(text), name, savedBy, savedAt
- `OtherWork`, `Inquiry`(+messages), `ImportLog`, `Mail`(id, type M01〜M15, to[], cc[], subject, body blocks, link, sentAt, readBy)

## 4. 業務ルール（domain/workflow.ts）

- 状態: 回覧中 / 差し戻し中 / 引き戻し中 / 回覧完了 / 対応中 / 完了 / 取り下げ。表示ラベルは「回覧中（回覧者3の承認待ち）」等。
- 送信: 回覧者1〜3（空欄除く）＋有効な回覧先を順に steps 化（送信時点で固定）。M01→依頼者、M02→最初の承認者。
- 承認: トークンを使用済みに。次の承認者に M02。最後なら状態「回覧完了」、M05→依頼者（CC リーダー・管理者）、M06→リーダー・管理者・IT。
- 差し戻し: コメント必須、`【MM/DD HH:mm 役割 氏名】コメント` を追記。状態「差し戻し中」、M03→依頼者。
- 引き戻し: 回覧中のみ。現在のトークン無効（理由: 引き戻し）、M04→承認待ちの人、状態「引き戻し中」。
- 再依頼: 差し戻し中・引き戻し中から S05→S07→送信。round+1、最初の回覧者から。
- 取り下げ: 回覧完了前は依頼者（S11）、以降は管理者（S27）。トークン無効（理由: 取り下げ）。
- 代理承認: 管理者・IT。理由必須。トークン無効（理由: 代理承認）、M10→本来の承認者・依頼者、次へ M02。
- 再送／承認者変更: 古いトークン無効（理由: 再送）、新トークンで M02。
- トークン有効期限14日。S13 の表示文言は要件どおり（承認済み／差し戻し済み／引き戻し／代理承認／取り下げ／期限切れ／URL不正）。
- 担当者保存: 新しく任命された人に M07。担当者が1人以上いて回覧完了なら「対応中」。
- 引き渡し完了日入力: 状態「完了」、M11→依頼者。
- 権限で S15 の入力欄を無効化（担当者割当・打ち合わせ・貢献額はリーダー以上、見積り〜引き渡しは担当者本人かリーダー以上）。
- 一覧の色: 納期超過＝赤、7日以内＝黄（基準日はアプリ内の「今日」= 実行日）。
- 貢献額: 引き渡し完了日（依頼書以外は完了日）基準で年度（4月〜翌3月）／月集計、担当者2人は配分で按分。
- ログイン: 従業員番号→設備メンバーはパスワード→初回は S03 必須。5回失敗で15分ロック。
- 問い合わせ: 公開範囲（全員／IT担当者だけ）、IT回答で「回答済み」、質問者の追加質問で「未回答」、解決。M13/M14/M15。
- 毎朝の処理: 納期7日前・3日前・当日・超過で M08、承認待ち2日で M12（新URL）、3日以上で M09。

## 5. 製図ページ（S06）の組み込み

- `public/seizu/seizu.html` を同一オリジンの iframe で表示。
- 読み込み: iframe の window に `DataTransfer` 付きの合成 `drop` イベントを送る（ツール既存のD&D読み込み処理を利用）。
- 取り出し: `contentWindow.showSaveFilePicker` を一時的に差し替えて書き込み内容を受け取り、ツールの「名前を付けて保存」ボタンを押す。
- 起動前に IndexedDB `seizu-tool` の復元データを消し、復元バナーが出ないようにする。
- 閲覧モード（承認者・閲覧のみ）: 実行時に style を注入して編集系ツールバーを隠し、透明の操作防止レイヤーは置かず「閲覧のみ」の帯を表示。保存ボタンは出さない。
- 外枠のボタン: 依頼書に保存 / JSONで保存（Tauriの保存ダイアログ）/ 印刷・PDF（ツールの印刷ボタン）/ 閉じる / 図面の切り替え・＋新しい図面（10枚まで）/ 版2として保存（設備メンバー）。
- 縮小表示: 図面JSONから簡易SVG（用紙枠・線・円・円弧・矩形・連続線・文字・寸法線・表題欄）を描く `DrawingThumb`。表題欄の図名は件名の自動入力に使う。

## 6. デザイン

- テーマ「Precision Workshop」: 背景 #07090C〜#0B0F14、面 #10151C/#151B24、罫線 rgba(255,255,255,.07)、文字 #E6EDF5/#8A97A8、アクセント シアン #3DD6F5、成功 #34E0A1、注意 #FFB547、危険 #FF6B6B、管理系 バイオレット #9B8CFF。
- 背景に薄い方眼（青写真）パターン。ID・日付・金額は等幅数字（IBM Plex Mono）、本文は IBM Plex Sans JP（同梱）。
- 状態色は要件の対応（差し戻し・引き戻し=オレンジ系、回覧完了・対応中=青系、完了・取り下げ=グレー）。
- 役割の色（緑=依頼者、赤=承認者、青=設備、紫=管理）はナビのラベル・アバターの縁取りに使用。
- 独自タイトルバー（decorations: false）、画面遷移は軽いフェード＋スライド。トーストは右下。
- 生成画像: ログイン背景、メニュー7・設定6のタイル画像、完了・結果・空状態、メールバナー、現場写真4、アイコン。CSS mask で端を背景に溶け込ませる。

## 7. テスト・確認

- `vitest` で workflow（回覧順・飛ばし・差し戻し再回覧・引き戻し・代理承認・トークン無効理由・完了遷移・按分集計）を検証。
- Vite 開発サーバーをブラウザで開いて主要フローを通し操作し、画面を目視確認。
- `tauri build --no-bundle` で EXE を作成し、起動を確認。成果物は `release/制作物依頼システム_サンプル.exe`。

## 8. 追加・変更（2026-10-29 ユーザー指示）

- 従業員番号は数字5桁（例：10123）。ログイン・社員データCSVの取り込みで5桁以外はエラー。
- 工程の表示：状態「回覧完了」「対応中」に、入力済みの項目から判定した工程を添える
  （打ち合わせ待ち → 見積り依頼待ち → 買い入れ待ち → 製作中 → 引き渡し待ち）。依頼書一覧に工程ごとの件数の帯と工程での絞り込み。
- 打ち合わせ・見積り依頼・買い入れは「済」なら日付必須、「未」に戻すと日付も消す。
- データ分析（S28・要件外の追加提案）：月別推移・納期遵守率・リードタイム・承認にかかる時間・担当者の負荷・部署別・問い合わせの分析。
  分析用に過去1年分の依頼履歴（差し戻し・代理承認・納期遅れを含む）をサンプルデータに追加。
