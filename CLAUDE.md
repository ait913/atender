# Atender — プロジェクト固有メモ

親規約: [Muraki/CLAUDE.md](../../CLAUDE.md)

## プロジェクト要約

時間割登録 + ワンタッチ出欠 + 出席率追跡のアプリ。学校 + 学科で時間割テンプレを public 共有し、再入力コストを下げる。Touri 自身を含む学生 (専門学校・大学) 向け。Web 版 (`apps/web`) が機能の正典。iOS ネイティブ版 (`apps/ios`) は **IA と機能を Web と共有しつつ、見た目と操作は iOS ネイティブ** (Apple HIG / 標準部品 / Liquid Glass)。

## 主要ドキュメント

- **★ デザイン正典: `DESIGN.md`** (iOS 視覚言語の正典)。UI 設計・実装は必ずこれを参照。トークンは Web と 1:1 一致済で、規定するのは「適用規則」(角丸/余白/影/タイポ/マスの描き方/ヘッダー規格)
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
- iOS (`apps/ios`): SwiftUI ネイティブ。API は Web と共通 (Bearer token)。xcodegen + xcodebuild、iOS 17+

## 規約・やらないこと

- API は完全分離 (Web client / iOS client から同一 API を叩ける形)。BFF 一体型は採用しない
- **iOS はネイティブ優先**。見た目・操作・部品は Apple HIG に従う。`apps/web` は**デザインの正典ではない**
  - **IA と機能は Web と共有する** (ここは不変)。ボトムタブ = 5項目 (ホーム/学期・科目/ルーム/友達/設定)。**Today/Timetable/Stats は独立画面ではない** (Web でも `/today` 無し・`/timetable`→`/`・`/stats`→`/semester`)。「今日の出欠」「時間割」は Home 内、「出席率」は 学期・科目。iOS でこれらを別タブに作らない。iOS 独自機能の追加・Web 機能の削除は設計 doc で明示的に決める
  - **中立の見た目はシステムに明け渡す**: 中立色 (背景/文字/罫線) は semantic system color、書体は built-in text style (本文 17pt / 最小 11pt)、タップ領域 44pt。`styles.css` のトークンを pt に移植しない
  - **ブランド資産は Web と共有し続ける**: accent (azure) / status 色 / 科目カラーパレット / キャラクター画像。**これらの色の値を iOS 側で勝手に変えない**
  - 標準部品を自前で再発明しない (`TabView` / `Picker` / `Menu` / `ContentUnavailableView` / `List` / `SignInWithAppleButton` / `.sheet`)。自前背景は Liquid Glass と干渉する
  - 詳細: `.designs/20260717-ios-ui-revamp.md`
- 時間割テンプレ共有は「学校 + 学科」で public 検索。opt-in 制にはしない (MVP)
- 出欠ルール (公欠等の扱い) は学校・学科でデフォ共有 + ユーザー個別上書き可
- キャラクター画像は Codex (gpt-image-1) 生成。アニメ調禁止、Claude/ChatGPT 系の親しみあるキャラ
- 自前 FW は組まない (2026-03末〜の AI 駆動・スピード重視フェーズ)。既製 OSS スタック採用

## 主要ワークフロー

### iOS をシミュレータで動作確認 (実データ + ログインスキップ)

iOS の Debug ビルドは `localhost:8787` を叩く。ログインは OAuth なので、**デモ seed + bearer 注入でログイン画面をスキップ**して実データで確認するのが定石。

```sh
# 0. 依存 + Prisma client (node_modules を作り直した後は必須)
pnpm install
cd apps/api
pnpm exec prisma generate
#    postinstall フックが無いので install だけでは client が生成されない。忘れると起動時に
#    `SyntaxError: @prisma/client does not provide an export named 'PrismaClient'`
#    — コードのバグに見えるが、未生成なだけ

# 1. API 起動 (--env-file 必須。`pnpm dev` 単体は env 未読込で起動失敗する)
pnpm exec tsx watch --env-file=.env src/index.ts      # → http://localhost:8787 (health: /healthz)

# 2. デモユーザー seed → bearer token 出力 (冪等)
pnpm exec tsx --env-file=.env scripts/seed-demo-user.ts
#    → token: demo-bearer-token-ios-resync-0001 (user/時間割/科目/出欠まで作る)

# 3. iOS ビルド
cd ../ios
/opt/homebrew/bin/xcodegen generate
xcodebuild -project Atender.xcodeproj -scheme Atender -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.2' build

# 4. token 注入で起動 → ログイン画面スキップ (AppEnvironment が #if DEBUG で keychain へ save)
SIMCTL_CHILD_ATENDER_UI_TEST_BEARER_TOKEN=demo-bearer-token-ios-resync-0001 \
  xcrun simctl launch <SIM_UDID> net.appily.atender
xcrun simctl io <SIM_UDID> screenshot out.png
```

- **注意**: AI がバックグラウンドで起動した API は**ターン終了で harness に kill される**。腰を据えて触るなら Touri 自身のターミナルで API を立てる。デモデータは `apps/api/prisma/dev.db` に永続化されるので API さえ立てれば再ログイン不要
- ユニットテスト: `xcodebuild test -scheme Atender ...`。**ベースライン件数の正典は `.knowledge/known-failures.md` の iOS 節** (旧記載の「157 GREEN 基準」は二重に誤りだったので撤回。同ファイル §「旧記載…」参照)。着手時に自分で 1 回走らせて実数を台帳に記録する

### 全画面・全モーダルのスクショ収集 (デザイン検証)

`AtenderUITests/ScreenshotFlow.swift` が token 注入で各画面/操作を辿りスクショを attachment 化する検証ハーネス。

```sh
xcodebuild test -project Atender.xcodeproj -scheme AtenderUITests \
  -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.2' -resultBundlePath run.xcresult
xcrun xcresulttool export attachments --path run.xcresult --output-path shots   # manifest.json で名前復元
```

### TestFlight に配布 (CLI 完結・Xcode GUI 不要)

有料 Developer Program (Team ID `2J3HYGP2K8`) 認証済。ASC API キーで CLI から archive → export → upload まで一気通貫。**署名周りは project.yml に焼き込み済** (`DEVELOPMENT_TEAM: 2J3HYGP2K8` / `CODE_SIGN_STYLE: Automatic`)。

**ASC API キー**: `~/.appstoreconnect/private_keys/AuthKey_973AZ487M3.p8` (**Admin ロール必須**。App Manager だと cloud-managed distribution certificate が 403 で作れず export で詰まる)。Issuer ID `a3955ee4-936a-4c78-b9d1-9d1c559885af`。バックアップは `.tmp/atender/`。

★ **無人実行の前提: キーチェーンの署名鍵 ACL を開けておく** (2026-07-29 に判明)

これを踏まないと `codesign` が `SecurityAgent` の許可ダイアログを出して**無言で固まる**。
CPU 0% でログも伸びないため「遅い」ではなく「ハング」だが、xcodebuild は何も言わない。
**一度実行すれば恒久的に効く**ので、次からは不要:

```sh
security unlock-keychain ~/Library/Keychains/login.keychain-db
security set-key-partition-list -S apple-tool:,apple:,codesign: -s \
  ~/Library/Keychains/login.keychain-db      # ログインパスワードを訊かれる
```

- **export が新しい配布証明書を作った直後も同じ許可が要る**ことがある。ハングしたら上を再実行する
- 症状の見分け方: `ps -Ao pid,etime,pcpu,comm | grep -E "codesign|SecurityAgent"` で
  両方が CPU 0% のまま経過時間だけ伸びていたらこれ
- ★ **xcodebuild の出力を `| tail` や `| grep` に通して背景実行しない**。
  バッファされて完了まで 1 バイトも出ず、ハングと正常進行を区別できなくなる (実際に踏んだ)。
  ファイルに落として `tail` で覗く

```sh
cd apps/ios
/opt/homebrew/bin/xcodegen generate

# 1. Archive (Release=本番API。generic/platform=iOS)
xcodebuild archive -project Atender.xcodeproj -scheme Atender -configuration Release \
  -destination 'generic/platform=iOS' -archivePath build/Atender.xcarchive \
  -allowProvisioningUpdates \
  -authenticationKeyPath ~/.appstoreconnect/private_keys/AuthKey_973AZ487M3.p8 \
  -authenticationKeyID 973AZ487M3 -authenticationKeyIssuerID a3955ee4-936a-4c78-b9d1-9d1c559885af

# 2. Export (build/ExportOptions.plist: method=app-store-connect, teamID, signingStyle=automatic)
#    ここで distribution 証明書を cloud 生成し再署名 (archive 自体は開発署名でよい)
xcodebuild -exportArchive -archivePath build/Atender.xcarchive \
  -exportOptionsPlist build/ExportOptions.plist -exportPath build/export \
  -allowProvisioningUpdates \
  -authenticationKeyPath ~/.appstoreconnect/private_keys/AuthKey_973AZ487M3.p8 \
  -authenticationKeyID 973AZ487M3 -authenticationKeyIssuerID a3955ee4-936a-4c78-b9d1-9d1c559885af

# 3. Upload (--validate-app で事前検証も可)
xcrun altool --upload-app -f build/export/Atender.ipa -t ios \
  --apiKey 973AZ487M3 --apiIssuer a3955ee4-936a-4c78-b9d1-9d1c559885af
```

- **バージョン更新: 版数の正典は `project.yml` の `info.properties` 一択** (現在 `CFBundleVersion: "16"` / `CFBundleShortVersionString: "1.0"`。**build 16 = 2026-07-30 に実機 FB 6 件 (学期セレクトの glass カプセル除去 / カレンダー選択日をセル全高のグレー塗りに / 予定 chip の非タッチ化と日別シートの共通部品化 / 全モーダルのヘッダーを `< タイトル ✕` の 1 行規格に / 友達・ルームの重複見出し削除と nav bar trailing 化 / マスコットの alpha 破損を原画から再切り出し) を入れて配布済**、ASC 上の最新。build 15 = 「タップが長押し気味でないと反応しない」の修正 (日セルの `Button` + `.onLongPressGesture` の競合を解消し、素の view に `.onTapGesture` + `.onLongPressGesture` を併記。自作 `EqualColumnsLayout` を廃止して標準の `LazyVGrid` に置換)。build 14 = カレンダーUI不具合5点 (罫線ズレ / 押せないセル / 青点削除 / タップ領域 / カード影の左右切れ)。build 13 = カレンダー5点 (エラー表示 / レイヤー / タップ範囲 / ヘッダー)。build 12 = 個人予定を instant 化 (破壊的 migration)。build 11 = カレンダーUI詰め5点。build 10 = EventKit双方向同期 + ルーム共有マスキング、build 9 = ホーム折りたたみ刷新 + 3バグ修正。**backend 依存を含むビルドは出荷時に atender-api を Coolify デプロイすること**)。次ビルドは `"17"` にインクリメントする。ASC の最新 build 番号は `~/.appstoreconnect` の鍵で `GET /v1/builds?filter[app]=6790604371&sort=-version` で確認できる
  - **`Atender/Info.plist` を手編集してはいけない。** XcodeGen は `info:` 指定があると Info.plist を**毎回生成し直す** ("Plists are created on disk on every generation of the project") ので、必須手順の `xcodegen generate` が手編集を**黙って巻き戻す**。Info.plist は git 管理下にあるため、xcodegen を走らせるまでは手編集が効いているように見えるのが厄介。詳細: `Muraki/knowledge/gotcha/xcodegen-info-plist-regenerated-every-run.md`
- 互換を壊す変更を含む場合は、`project.yml` の `CFBundleVersion` を N に上げたうえで `apps/api/src/lib/clientVersion.ts` の `MIN_IOS_BUILD` を N に上げる。`MIN_IOS_BUILD > 今から配る CFBundleVersion` にすると、配った直後に全員が 426 で自滅するため、必ず `MIN_IOS_BUILD <= これから配る CFBundleVersion` を確認する
- 暗号化コンプライアンス: `ITSAppUsesNonExemptEncryption: false` を `project.yml` の `info.properties` で宣言済 (→ 生成される Info.plist に入る) → TestFlight の輸出質問はスキップ
- アップロード後 Apple 側処理 15〜30分 → ASC の TestFlight タブにビルド出現 → 内部テスター追加 (Beta App Review 不要)。外部テスターは Beta App Review + Test Information 記入が要る
- Xcode GUI サインインは不要 (API キーが署名・アップロード両方を担う)

## デプロイ / 外部リソース

- Web URL: https://atender.appily.run
- API URL: https://atender-api.appily.run (health: `GET /healthz`)
- Coolify app uuid:
  - atender-api: `tq2lgr4eh6t80r3tkqjbpu7o`
  - atender-web: `y1acaktqgsx66sj81qsxn5m3`
- Coolify deploy トリガー: `curl "$COOLIFY_API_BASE/deploy?uuid=<uuid>" -H "Authorization: Bearer $COOLIFY_API_TOKEN"`
- 関連 SKILL: `appily`
- Resend: API key は `.tmp/atender/secrets.env` (gitignore 済) 参照
