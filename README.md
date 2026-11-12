# 制作物依頼システム（サンプルアプリ）

`docs/要件定義書_工作依頼システム_第1.3版.xlsx` をもとに作った、上司に提示するためのモック（デスクトップアプリ・単一EXE）です。
全27画面（S01〜S27）とメールBOX、要件外の追加として「データ分析」（S28）を操作できます。担当者は5人まで登録でき、依頼書一覧では工程（打ち合わせ待ち・買い入れ待ちなど）で絞り込めます。
依頼書の入力では原価センターを選びます（4,393件。所属の「・」より前の区分〔本社・LF・エン など〕で絞り込み、原価センター・所属の一部で検索）。原価センターは社員の所属部署とは別のデータです。

## すぐに使う

`release/` の EXE をダブルクリックするだけです（インストール不要）。

| ファイル | 対象のPC |
|---|---|
| `制作物依頼システム_サンプル.exe` | 一般的な Windows PC（x64）。ARM64 の Windows でも動きます |
| `制作物依頼システム_サンプル_ARM64.exe` | ARM64 版 Windows（Snapdragon など） |

- Windows 11 には必要な WebView2 が最初から入っています（古い Windows 10 では WebView2 ランタイムが必要なことがあります）。
- メールは実際には送らず、画面上部の「メールBOX」に届きます。
- データはメモリ上だけに保存し、アプリを閉じるとサンプルデータに戻ります。
- 画面右上の「デモの進め方」に、上司へのデモの流れをまとめています。

### デモ用アカウント（ログイン画面でクリック）

| 従業員番号 | 氏名 | 表示される権限 | パスワード |
|---|---|---|---|
| 54414 | 野村 侑矢 | 設備メンバー | demo1234 |
| 79306 | 川口 大地 | 設備メンバー | demo1234 |
| 52035 | 斎藤 優治 | 設備班長 | demo1234 |
| 38660 | 梶原 徹 | 設備班長 | demo1234 |
| 28316 | 石郷 誠 | 設備組長 | demo1234 |
| 49442 | 中村 康裕 | 設備組長 | demo1234 |
| 22056 | 伏谷 秀和 | 設備工長 | demo1234 |
| 22668 | 天草 恒紀 | 設備課長 | demo1234 |
| 30258 | 平塚 慎太郎 | IT担当者 | demo1234 |
| 29446 | 鶴岡 幸一 | 一般の社員（安全衛生G・依頼者） | 不要 |

権限は社員データの所属部署・役職から自動で決まります（設備係の社員＝設備メンバー、そのうち班長＝設備班長（リーダー権限）、組長・工長・課長＝設備組長・設備工長・設備課長（管理者権限））。ユーザー管理で付けるのはIT担当者権限だけです。

承認者（課長・回覧先など）はログインせず、メールBOXの承認依頼メールのURLから承認します。

## 構成

```
docs/                     要件定義書・設計書（superpowers/specs）・実装計画（superpowers/plans）
release/                  完成した EXE
app/
  src/domain/             業務ルール（承認回覧・進捗・集計・CSV取り込み・分析）と自動テスト
  src/data/               サンプルデータ（過去1年分の履歴を含む）・サンプル図面・原価センター表（costCenters.tsv）
  src/screens/            画面（S01〜S28・メールBOX）
  src/components/         共通部品（タイトルバー・枠・図面の縮小表示など）
  src/assets/img/         画像（Codex gpt-6.1-sol で生成したものを WebP に変換）
  design/generated/       生成した画像の元データ（PNG）
  public/seizu/seizu.html 製図ツール（既存の製図ツールを無変更でコピー）
  src-tauri/              デスクトップアプリ（Tauri 2・Rust）
```

## 開発

```bash
cd app
npm install
npm run dev          # http://localhost:5178 で画面を確認
npm test             # 業務ルールの自動テスト（vitest）
npx tsc --noEmit     # 型チェック
npx tauri build --no-bundle --target x86_64-pc-windows-msvc   # x64 版 EXE
npx tauri build --no-bundle --target aarch64-pc-windows-msvc  # ARM64 版 EXE
```

EXE は `app/src-tauri/target/<ターゲット>/release/seisakubutsu-irai.exe` にできます。

## 技術

Tauri 2（Rust）／React 19・TypeScript・Vite／zustand／lucide-react／IBM Plex Sans JP・IBM Plex Mono（同梱）
