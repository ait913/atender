# Atender

時間割登録 + ワンタッチ出欠 + 出席率追跡の Web アプリ。学校 + 学科で時間割テンプレを public 共有して再入力コストを下げる。

- 仕様・規約: [CLAUDE.md](./CLAUDE.md)
- MVP 設計 doc: [.designs/20260513-mvp.md](./.designs/20260513-mvp.md)
- 事前リサーチ: [.knowledge/00-research-summary.md](./.knowledge/00-research-summary.md)

## スタック (MVP)

- **Backend**: Hono (Node) + better-auth 1.6.x + Prisma 6.x + SQLite + Resend
- **Frontend**: Vite + React 19 + TypeScript + TanStack Router/Query
- **Monorepo**: pnpm workspace (`apps/api`, `apps/web`, `packages/shared`)
- **Auth**: Magic Link + Google OAuth (Apple Sign-In は Phase 2 で iPhone 版に追加)
- **Deploy**: Coolify 2 service (Appily)

## 開発

```sh
corepack enable
pnpm install
pnpm -F @atender/api db:generate
pnpm -F @atender/api db:migrate dev --name init
pnpm -F @atender/api db:seed
pnpm -F @atender/api dev
```

共有型 package の build:

```sh
pnpm -F @atender/shared build
```

API の production build:

```sh
pnpm -F @atender/api build
```
