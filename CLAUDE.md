# Atender — プロジェクト固有メモ

親規約: [Muraki/CLAUDE.md](../../CLAUDE.md)

## プロジェクト要約

時間割登録 + ワンタッチ出欠 + 出席率追跡の Web アプリ。学校 + 学科で時間割テンプレを public 共有し、再入力コストを下げる。Touri 自身を含む学生 (専門学校・大学) 向け。MVP は Web、使用感が良ければ iPhone 版に展開。

## 主要ドキュメント

- 設計書: `.designs/<YYYYMMDD>-<feature-slug>.md` (Architect が作成)
- プロジェクト固有ナレッジ: `.knowledge/<topic>.md`
- 参考 (クロス PJ knowledge):
  - `Muraki/knowledge/library/authjs-v5-prisma-sqlite.md` — Magic Link + Google 構成
  - `Muraki/knowledge/pattern/web-first-capacitor-later-design.md` — Web 先行 → iPhone 後付け戦略
  - `Muraki/knowledge/pattern/touri-design-philosophy.md` — シンプル+並列拡張
  - `Muraki/knowledge/pattern/aisaba-design-language.md` — 視覚デザイン言語
  - `Muraki/knowledge/tool-quirk/codex-cli-imagegen-tool.md` — Codex キャラ生成

## 技術スタック

- Runtime: Node 20 LTS / pnpm 9.15.x workspace (monorepo: `apps/api`, `apps/web`, `packages/shared`)
- Backend (`apps/api`): Hono 4.12.x + @hono/node-server 2.0.x + @hono/zod-validator + better-auth 1.6.x + Prisma 6.19.x + better-sqlite3 + Resend 4.12.x + Zod 3.23.x + dayjs
- Frontend (`apps/web`): Vite 6 + React 19 + TypeScript 5.6 + TanStack Router + TanStack Query + Tailwind (web 召集時に確定)
- Shared (`packages/shared`): Zod schemas + TypeScript 型 (型共有のみ)
- DB: SQLite (Prisma `provider = "sqlite"`、Coolify Volume mount で `/app/data/prod.db`)
- 認証: Magic Link + Google OAuth (better-auth + Resend 送信、cookie session 30 日、SameSite=Lax)
- ホスティング: Appily (Coolify + Nginx) 2 service 構成 (`atender-api` / `atender-web`)
- iPhone (Phase 2): SwiftUI ネイティブ第一案、API は共通

## 規約・やらないこと

- API は完全分離 (Web client / iPhone client から同一 API を叩ける形)。BFF 一体型は採用しない (iPhone 移行で歪む)
- Apple Sign-In は MVP では非対応。iPhone ネイティブ実装段で追加
- 時間割テンプレ共有は「学校 + 学科」で public 検索。opt-in 制にはしない (MVP)
- 出欠ルール (公欠等の扱い) は学校・学科でデフォ共有 + ユーザー個別上書き可
- キャラクター画像は Codex (gpt-image-1) 生成。アニメ調禁止、Claude/ChatGPT 系の親しみあるキャラ
- 自前 FW は組まない (2026-03末〜の AI 駆動・スピード重視フェーズ)。既製 OSS スタック採用

## 主要ワークフロー

<!-- TODO: 実装着手後、頻出操作 (ローカル起動 / デプロイ / DB migration 等) を追記 -->

## デプロイ / 外部リソース

- URL: (TBD; appily.* のサブドメイン or 独自ドメイン)
- Coolify app uuid: (TBD)
- 関連 SKILL: `appily`
- Resend: メール送信。API key は設計 doc 承認後に Touri が発行
