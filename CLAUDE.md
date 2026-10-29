# Atender — プロジェクト固有メモ

親規約: [Muraki/CLAUDE.md](../../CLAUDE.md)

## プロジェクト要約

時間割登録 + ワンタッチ出欠 + 出席率追跡のアプリ。学校 + 学科で時間割テンプレを public 共有し、再入力コストを下げる。Touri 自身を含む学生 (専門学校・大学) 向け。Web 版 (`apps/web`) が機能の正典。カレンダー機能 (個人予定・ルーム予定・ICS・Google Calendar 連携・EventKit 読み込み) は build 21 で全面撤去。残るのは iOS の時間割の iPhone カレンダー書き出し (`GET /api/occurrences`) だけ。iOS ネイティブ版 (`apps/ios`) は **機能を Web と共有しつつ、入口・見た目と操作は iOS ネイティブ** (Apple HIG / 標準部品 / Liquid Glass)。

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
- 認証: Magic Link + Google OAuth (better-auth + Resend 送信、cookie session 30 日、SameSite=Lax。Google はサインインのみ。Google Calendar 連携は build 21 で撤去)
- ホスティング: Appily (Coolify + Nginx) 2 service 構成 (`atender-api` / `atender-web`)
- iOS (`apps/ios`): SwiftUI ネイティブ。API は Web と共通 (Bearer token)。xcodegen + xcodebuild、iOS 17+

## 規約・やらないこと

- API は完全分離 (Web client / iOS client から同一 API を叩ける形)。BFF 一体型は採用しない
- **iOS はネイティブ優先**。見た目・操作・部品は Apple HIG に従う。`apps/web` は**デザインの正典ではない**
  - Web のボトムナビは 5 項目、**iOS は 4 タブ (ホーム/学期・科目/友達/設定)** — ルームは iOS ではホームの context chip に集約 (2026-09 build 18、`.designs/20260908-build18-rooms-reschedule-export.md`)。機能は Web と共有、入口だけが違う。**Today/Timetable/Stats は独立画面ではない** (Web でも `/today` 無し・`/timetable`→`/`・`/stats`→`/semester`)。「今日の出欠」「時間割」は Home 内、「出席率」は 学期・科目。iOS でこれらを別タブに作らない。iOS 独自機能の追加・Web 機能の削除は設計 doc で明示的に決める
  - **中立の見た目はシステムに明け渡す**: 中立色 (背景/文字/罫線) は semantic system color、書体は built-in text style (本文 17pt / 最小 11pt)、タップ領域 44pt。`styles.css` のトークンを pt に移植しない
  - **ブランド資産は Web と共有し続ける**: accent (azure) / status 色 / 科目カラーパレット / キャラクター画像。**これらの色の値を iOS 側で勝手に変えない**
  - 標準部品を自前で再発明しない (`TabView` / `Picker` / `Menu` / `ContentUnavailableView` / `List` / `SignInWithAppleButton` / `.sheet`)。自前背景は Liquid Glass と干渉する
  - 詳細: `.designs/20260717-ios-ui-revamp.md`
- 時間割テンプレ共有は「学校 + 学科」で public 検索。opt-in 制にはしない (MVP)
- 出欠ルール (公欠等の扱い) は学校・学科でデフォ共有 + ユーザー個別上書き可。**科目ごとの基準 (必要出席率 / 欠席上限回数 / 遅刻換算) は `Course` に持つ (build 21)**
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
#    ★ `name=...,OS=18.2` が "Unable to find a device" で解決できない環境がある (2026-10-07)。その場合は
#    `xcrun simctl list devices available` の UDID で `-destination 'platform=iOS Simulator,id=<UDID>'` を使う

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

### ストア画像を作り直す (App Store スクショ)

正典は `.designs/20261029-store-screenshots.md` §6 (コマンド列) + §11 (申し送り)。`mocks/store/` (Bloom から移植した HTML + `render.mjs`、puppeteer-core + `/Applications/Google Chrome.app`) に、ストア用 seed `apps/api/scripts/seed-store-demo.ts` (架空の「生わさび専門学校 / 情報処理科」、平日のみ実行可) + 撮影 UITest `AtenderUITests/StoreShotsFlow.swift` (iPhone 16 Pro Max シミュレータ、status_bar 9:41) で素材を撮り、`node render.mjs` で 1320×2868 を出す。完成画像は `assets/store/<版>/slide-{1..5}.png` (現行 1.0.1)。`mocks/store/shots/` と `out/` は git 管理外。撮り直し時は `simctl uninstall` → seed → `build-for-testing` / `test-without-building` の順 (seed を作り直すと semester ID が変わり、アプリが旧 ID を覚えているため)。

### LP / SNS 画像を更新する

正典は `.designs/20261030-landing-page-and-social-image.md` §6 (挙動) と `mocks/social/README.md`。文言・レイアウトは `apps/lp/site/index.html` / `style.css` を直接編集。端末画像はストア画像 (`assets/store/<版>/`) から `python3 -I mocks/social/extract-phones.py` で作り直し、SNS 画像 3 枚 (`hero-1920x1080.png` / `friends-1920x1080.png` / `og-1200x630.png`、全てマスコット入り) は `bash mocks/social/render.sh` 1 回で `assets/social/<版>/` に出る (OG は `apps/lp/site/` にもコピーされる)。ストア画像を作り直して端末の CSS 座標が変わったら extract-phones.py の定数を引き直す。デプロイは Coolify の `atender-lp` を deploy (POST)。

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

- **バージョン更新: 版数の正典は `project.yml` の `info.properties` 一択** (現在 `CFBundleVersion: "23"` / `CFBundleShortVersionString: "1.0.1"`。公開済みの App Store version と同じ ShortVersion の build は上げられない (§2)。**build 21 = 2026-10-29 配布済** (Delivery UUID `8ee9aea8-e766-4a1b-b2c1-bc07b192f067`。export は Apple PLA 承諾後に通った: `Muraki/knowledge/gotcha/apple-pla-update-blocks-cloud-signing.md`)。内容: カレンダー撤去 (iOS/Web。API 側は A2 = デプロイ 2 として **2026-10-30 に完了**: 1.0.1 READY_FOR_SALE 確認後に route 34 本 + Prisma 9 モデル DROP、`MIN_IOS_BUILD = 21`、build 20 以前は 426) / 科目別出席基準 (`Course` に必要出席率・欠席上限・遅刻換算) / 公開時間割の提案と取り込み。migration `b21_course_attendance_rules` + `b21_template_source_link`。設計 = `.designs/20261029-build21-calendar-removal-course-rules-template-import.md`。**build 20 = 2026-10-09 配布済** (アカウント削除 + 法務ページ + SIWA 認可コード交換。詳細は git)。build 19 以前の記録は git 履歴を参照。**build 22 = 2026-10-30 配布済** (Delivery UUID `b574f69e-72c2-4967-a262-050f924e68d0`)。ホームの時間割グリッド行高を個人/ルームで統一 (÷7.5、ただし効かず)。**build 23 = 2026-10-30 配布済 (Delivery UUID `5233585a-458b-4a8a-9f29-c69509bc0dc5`)。** 時間割グリッドの行高を個人/ルームで実測一致させる (build 22 の修正は available の差で効いていなかった)。**次ビルドは `"24"` にインクリメントする。** **backend 依存を含むビルドは出荷時に atender-api を Coolify デプロイすること**。ASC の最新 build 番号は `~/.appstoreconnect` の鍵で `GET /v1/builds?filter[app]=6790604371&sort=-version` で確認できる
  - **`Atender/Info.plist` を手編集してはいけない。** XcodeGen は `info:` 指定があると Info.plist を**毎回生成し直す** ("Plists are created on disk on every generation of the project") ので、必須手順の `xcodegen generate` が手編集を**黙って巻き戻す**。Info.plist は git 管理下にあるため、xcodegen を走らせるまでは手編集が効いているように見えるのが厄介。詳細: `Muraki/knowledge/gotcha/xcodegen-info-plist-regenerated-every-run.md`
- 互換を壊す変更を含む場合は、`project.yml` の `CFBundleVersion` を N に上げたうえで `apps/api/src/lib/clientVersion.ts` の `MIN_IOS_BUILD` を N に上げる。`MIN_IOS_BUILD > 今から配る CFBundleVersion` にすると、配った直後に全員が 426 で自滅するため、必ず `MIN_IOS_BUILD <= これから配る CFBundleVersion` を確認する。App Store 公開中の build が叩く API を消すときは、新 build が `READY_FOR_SALE` になってから消す 2 段デプロイにする (実例: build 21 の A2 = カレンダー API の削除)。
- 暗号化コンプライアンス: `ITSAppUsesNonExemptEncryption: false` を `project.yml` の `info.properties` で宣言済 (→ 生成される Info.plist に入る) → TestFlight の輸出質問はスキップ
- アップロード後 Apple 側処理 15〜30分 → ASC の TestFlight タブにビルド出現 → 内部テスター追加 (Beta App Review 不要)。外部テスターは Beta App Review + Test Information 記入が要る
- Xcode GUI サインインは不要 (API キーが署名・アップロード両方を担う)

## デプロイ / 外部リソース

- Web URL: https://atender.appily.run
- API URL: https://atender-api.appily.run (health: `GET /healthz`)
- LP URL: https://atender.aisaba.net (health: GET /healthz)
- atender-lp: <Coolify 作成後に Leader が記入>
- Coolify app uuid:
  - atender-api: `vrdxzvmakcxieyhfhayz5r8r`
  - atender-web: `xxg31wshj6rhjmnffju1bg5r`
- Coolify deploy トリガー: `curl -X POST "$COOLIFY_API_BASE/deploy?uuid=<uuid>" -H "Authorization: Bearer $COOLIFY_API_TOKEN"` (**2026-10-08 から POST 必須**。GET は `This endpoint has changed to a POST request.` を返す)。進捗は `GET $COOLIFY_API_BASE/deployments/<deployment_uuid>` の `status`
- 関連 SKILL: `appily`
- Resend: API key は `.tmp/atender/secrets.env` (gitignore 済) 参照
