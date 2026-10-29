# 制作物依頼システム サンプルアプリ Implementation Plan

> **For agentic workers:** 実行はこのセッション内でインライン実行（ユーザー承認済み）。Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 要件定義書（第1.2版）の全27画面＋メールBOXを操作できるモックを、Tauri 2 の単一EXEとして作る。

**Architecture:** React+TS の SPA をメモリ上の zustand ストアで動かす。業務ルールは `src/domain` の純粋関数に集約し vitest でテスト。製図ツール `seizu.html` は無変更コピーを iframe で組み込み、外側から読み込み・保存を操作する。Tauri 側は保存ダイアログのコマンドのみ。

**Tech Stack:** Tauri 2, Rust, React 18, TypeScript, Vite, zustand, lucide-react, @fontsource (IBM Plex Sans JP / IBM Plex Mono), vitest, Pillow（画像WebP変換）, Codex CLI gpt-6.1-sol（画像生成）

設計書: `docs/superpowers/specs/2026-10-29-seisakubutsu-irai-mock-design.md`

---

### Task 1: 画像生成（バックグラウンド）
- [ ] Codex `-m gpt-6.1-sol` で 27 枚を `app/design/generated/` に生成（6並列）
- [ ] Pillow で WebP 化し `app/src/assets/img/` へ。アイコンは `src-tauri/icons` 用に `tauri icon` で変換
- 完了条件: 全ファイルが存在し、目視で品質確認済み。不良は作り直す

### Task 2: プロジェクト雛形
**Files:** `app/package.json`, `app/vite.config.ts`, `app/tsconfig.json`, `app/index.html`, `app/src/main.tsx`, `app/src-tauri/*`
- [ ] Vite React-TS を作成し依存を追加、Tauri 2 を初期化（productName: 制作物依頼システム、decorations: false、1440x900、min 1280x800）
- [ ] `public/seizu/seizu.html` に原本をコピー（ハッシュ一致を確認）
- [ ] Rust コマンド `save_text_file(default_name, content, bom)` を rfd で実装
- 完了条件: `npm run dev` で空画面が表示、`cargo check` が通る

### Task 3: ドメイン層（TDD）
**Files:** `app/src/domain/{types,format,rules,workflow,mails,stats,drawing}.ts`, `app/src/domain/__tests__/workflow.test.ts`
- [ ] テスト先行: 送信で steps 生成（空欄飛ばし・無効回覧先除外）、承認で次へ M02、最後で回覧完了＋M05/M06、差し戻しでコメント追記＋M03、再依頼で round+1、引き戻しでトークン無効理由、代理承認、再送、取り下げ、担当者保存で対応中＋M07、引き渡しで完了＋M11、按分集計、納期色判定、トークン期限切れ
- [ ] 実装してテストを通す
- 完了条件: `npx vitest run` 全件 PASS

### Task 4: サンプルデータ
**Files:** `app/src/data/seed.ts`, `app/src/data/drawings.ts`
- [ ] 社員約30名・部署8・回覧先3・依頼書12件（各状態を網羅、R2026-0102〜0124）・依頼書以外の作業・問い合わせ・取り込み記録・初期メール
- [ ] 製図ツール形式（format: seizu-tool, version: 1）のサンプル図面 4 枚
- 完了条件: 製図ツールで開いて表示されることを確認

### Task 5: デザインシステムと共通部品
**Files:** `app/src/styles/{tokens,base,components}.css`, `app/src/components/*`
- [ ] トークン・方眼背景・ボタン・入力・テーブル・カード・バッジ・モーダル・トースト・タブ
- [ ] TitleBar（ウィンドウ操作）、DemoDock（システム/メールBOX/自動処理/初期化）、AppShell（ユーザー表示・メニュー・ログアウト・擬似URL）、StatusBadge、ApprovalTrack、DrawingThumb、EmployeePicker(S08)、EmptyState、PageHeader
- 完了条件: 全画面で共通部品のみで組める

### Task 6: ストアとルーター
**Files:** `app/src/store/store.ts`, `app/src/router.ts`, `app/src/App.tsx`
- [ ] zustand ストア（ドメイン関数を呼び、メール発行時にトーストを表示）
- [ ] 画面ルーティング、ログイン後の遷移先保持、メールURLからの遷移

### Task 7: 画面 — ログイン・メニュー（S01〜S04）
### Task 8: 画面 — 依頼者（S05, S07, S08, S09, S10, S11）
### Task 9: 製図ページ（S06）と iframe 連携
### Task 10: 画面 — 承認（S12, S13）とメールBOX
### Task 11: 画面 — 設備（S14〜S17）
### Task 12: 画面 — 問い合わせ（S18〜S20）
### Task 13: 画面 — 設定（S21〜S27）
- 各タスク完了条件: 要件の項目①②…が画面上に存在し、遷移一覧表どおりに移動できる。権限で表示・入力が切り替わる

### Task 14: 確認とビルド
- [ ] vitest 全件 PASS、`tsc --noEmit` エラー 0
- [ ] ブラウザで主要フロー（依頼→メールBOX→承認×n→回覧完了→担当者割当→進捗→完了→成果確認、差し戻し→再依頼、引き戻し、代理承認、問い合わせ）を通し操作
- [ ] `npx tauri build --no-bundle` → `release/制作物依頼システム_サンプル.exe` を起動確認
