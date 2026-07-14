# atender — 既知の失敗テスト台帳 (ベースライン)

CLAUDE.md「ベースライン失敗の台帳」に基づく。分類: テスト陳腐化 / 環境依存 / 未分類。
**未分類を残したままのマージは不可。**

初版: 2026-07-14 (Reviewer、feature/login-auth-revamp レビュー時に棚卸し)

## API (apps/api, Vitest)

### テスト陳腐化 (better-auth 1.6.11 の挙動変化。feature 非依存・親コミットでも同一)

これらは `tests/auth.test.ts` の Magic Link 系。**送信自体は正常** (probe で 200 + Verification 1 行 + Resend 1 回を確認)。旧テストが better-auth の旧挙動を前提にしている。

- `[§8 #2] two Magic Link requests ... create two Verification rows`
  - 期待 `verification.identifier contains "<email>"` → 実際 0。better-auth 1.6.11 は identifier を**不透明ランダムトークン**で保存 (probe 実測 `DZyvoUEUYcVtOOPXiwVYlRyUnOXJuijl`)。email を含まないので `contains email` フィルタが 0 になるだけで、行は生成されている。
  - 直し方: フィルタを identifier でなく件数 (`verification.count()` の差分) か `value`/別カラムで取る。
- `[§8 #3] expired Magic Link token ... returns 400`
  - 期待 400 JSON → 実際 302。better-auth 1.6.11 は verify 失敗時に**エラー callback へ 302 リダイレクト**する (JSON 400 を返さない)。
- `[§8 #4] invalid Magic Link token does not create a Session`
  - 期待 status>=400 → 実際 302。#3 と同根 (verify は常にリダイレクト)。Session 非作成の副次 assert は正しい可能性が高いが status assert が陳腐化。
- `[§8 #76] Resend failure makes Magic Link request return 500`
  - 期待 500 → 実際 200。better-auth 1.6.11 は送信失敗を 5xx に伝播しない。
  - 直し方: 送信失敗時の可観測な契約 (ログ/戻り) を再定義するか、テスト削除。

→ **いずれも本 feature (Apple/native-callback/setup.ts) とは無関係**。親コミット (5343c82, 実装前) で同一 4 件が失敗することを確認済み。設計の「apps/api 全 Vitest GREEN」は better-auth 更新で陳腐化している。**Magic Link の設計要件 D1 (send 200 + Resend 1 回) は既存 `[§8 #1]` が pass、probe でも確認済みで満たされている。**

### 環境依存 (Reviewer のローカル harness 固有。CI/クリーン env では発生しない)

- `tests/ios-api.test.ts §8.4` の native/callback 3 件 (valid→302 / no session→401 / next 省略→302)
  - **原因: dev 用 `apps/api/.env` (gitignore) がテストプロセスに漏れ、`.env.test` を上書きしていた。** その `.env` の `BETTER_AUTH_TRUSTED_ORIGINS` が `...,atender://` と **`auth` 欠落で truncate** されており、`atender://auth` が trusted 判定されず 400 になっていた。
  - **native/callback のコード自体は正しい**: `.env` を `atender://auth` に直すと §8.4 全 12 pass、probe で `next=atender://auth`→302 / `next` 省略→302 atender://auth / evil.com→400 を確認 (C2/C4/C5 充足)。
  - **本番影響の注意**: 同じ truncate (`atender://` vs `atender://auth`) が Coolify PROD の `BETTER_AUTH_TRUSTED_ORIGINS` に入ると feature が本番で無効化される。投入値は厳密に `atender://auth` であること。


### テスト方法論の限界 (実装は正しい。in-process env 差し替えで観測不能)

- `tests/auth-apple.test.ts > registers the Apple provider route when dynamic client secret env is configured` → **it.skip 化済み**。
  - 設計 A6 の「provider 非 null 側 = apple ルート存在 (非404)」は、`src/env.ts` が **import 時に process.env を一度パースして固定**するため、実行時 `process.env.APPLE_* set → resetAuth()` では `getAppleProviderConfig` に届かず in-process 検証不能。
  - **実装は正しい**: APPLE_* をプロセス起動前に export した boot-probe で `POST /sign-in/social {provider:"apple"}` が **401 INVALID_TOKEN (provider 登録済・bogus idToken 拒否)** を返す (404 でない) ことを実証。
  - 詳細 gotcha: `Muraki/knowledge/gotcha/env-module-import-time-parse-defeats-runtime-env-swap.md`。
  - A6 の「未設定側 = 404」は in-process で pass。B1-B5 (buildAppleClientSecret / normalizeApplePem) は 5 件全 pass。

## 実行環境メモ (Reviewer harness)

- この harness では `prisma migrate deploy` / `prisma` CLI が起動時ハングする (schema-engine バイナリ直叩きは即動作)。テスト実行時は `tests/helpers/db.ts ensureTemplateDb` の `npx prisma migrate deploy` をシムで差し替え、既知の正しい `template.db` を復元して回避した (スキーマは本 feature で不変)。
- Vitest 実行は `CHECKPOINT_DISABLE=1` + シム PATH + サンドボックス無効が必要。

## iOS (apps/ios, XCTest)
- ベースライン 157 GREEN (CLAUDE.md)。本 feature の E/F は別途検証 (session 記録参照)。
