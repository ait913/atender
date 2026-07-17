# Web / iOS / API のバージョン対応管理

## 目的

端末に無期限に residual する iOS ビルドが、非互換になった API と喋り続けるのを止められるようにする。
そのために「今やらないと後から不可能なこと」(全リクエストへの client 版数の申告 + 起動時の互換チェック) だけを先に入れ、
採番・リリース運用は手動のまま据え置く。

---

## 1. スコープ

### 管理するのは 1 次元だけ — API × iOS build

| 組み合わせ | ズレるか | ズレたら | 管理要否 |
|---|---|---|---|
| Web × API | **同一 commit から同時デプロイ** (実測: 両 Coolify app とも `ait913/atender` の main HEAD、現在ともに `3078d66f55a7`) | reload で自己修復 (数秒〜数分の一過性) | **不要** |
| iOS × API | **ズレる**。TestFlight ビルドは端末に無期限に residual し、ユーザーが更新するまで古いまま | 直らない。decode 失敗・機能停止が永続 | **必要** |

→ **3 成果物 × 3 の対応表は作らない。** 管理対象は `API` が「どの iOS build 以上を受け入れるか」の 1 次元。
その実体は API のコード内定数 `MIN_IOS_BUILD` **1 個**。

### やらないこと (根拠は §11 不採用案)

- Web / API への semver・git tag・CI・changesets の導入
- iOS 版数の自動採番 (`project.yml` の手動インクリメントのまま)
- `latestIOSBuild` とソフト更新催促 (「新しい版があります」の非ブロッキング通知)
- **DTO drift の検出 (契約テスト)** — §10 で別テーマとして切り出す。理由も同節
- `CFBundleDevelopmentRegion = en` の是正 (findings ★12-2) — ローカライズの問題であり版数管理と無関係。UI 刷新 doc (`BackHeaderButton` 廃止と同じ根) の領分
- known-failures A1〜A8 の修正 (裁定待ち)。§12 で非依存であることを示す

### 既に解決済み (本設計では触らない)

findings ★12-1 の「CLAUDE.md が `Info.plist` の手編集を指示している」バグは **main の `6c80bec` で修正済**
(`CLAUDE.md:118-119` が「版数の正典は `project.yml` の `info.properties` 一択」に置換済)。
本設計はこの前提の上に立ち、再修正しない。§9 で運用ルールを 1 行足すだけ。

---

## 2. 設計の土台 (Architect が本日実測した事実)

Researcher findings に加え、設計判断が丸ごと乗っている事実を自分で再現・検証した。

| # | 事実 | 確認方法 |
|---|---|---|
| F1 | Coolify は **runtime env に `SOURCE_COMMIT` を default で注入する**。ユーザー定義 env に `SOURCE_COMMIT` が無い場合のみ注入 (`ApplicationDeploymentJob.php` `generate_coolify_env_variables(forBuildTime: false)` → `generate_environment_variables()`) | Coolify main の実装読解 + `GET /applications/tq2lgr4eh6t80r3tkqjbpu7o/envs` で `SOURCE_COMMIT` がユーザー定義に**無い**ことを実測 |
| F2 | 注入値は **40 桁 hex の full SHA**。ただし解決失敗時は `'unknown'`、ls-remote 前は `'HEAD'` になり得る | 同上 + `GET /deployments/applications/<uuid>` の `commit` が `3078d66f55a71496bd82dcfb2b97da7b4857892b` |
| F3 | **build arg としての `SOURCE_COMMIT` は default 無効** (`include_source_commit_in_build` の migration default = `false`。docker cache を壊すため) | `database/migrations/2025_11_26_124200_*.php` を実読 |
| F4 | atender-web は `build_pack=dockerfile` の静的ビルド (`static_image: nginx:alpine`) | `GET /applications/y1acaktqgsx66sj81qsxn5m3` |
| F5 | `URLSessionConfiguration.httpAdditionalHeaders` に入れたヘッダは **`URLProtocol` スタブから見える** | macOS Swift で `URLProtocol` スタブを実走させ `allHTTPHeaderFields` に `X-Atender-Client: ios/6` が入ることを確認 |

**F3 + F4 の帰結**: Web は静的バンドルなので、自分の commit を自己申告できない (runtime env はコンテナにあるが、ビルド済 JS には届かない。build arg 経路は default 無効で、有効化すると docker cache が毎コミット壊れる)。
→ **`/version` が返す `commit` は API のもの**。Web も同一 commit を追う運用だが、機械的保証はない (deploy は別トリガ)。
Web × API のズレは reload で自己修復するので、これを管理対象にしない (§1) 判断と整合する。

**F5 の帰結**: ヘッダの付与を「session config 1 箇所」に集約しても、既存の `StubURLProtocol` ハーネスでそのまま検証できる (§8 I1)。付与箇所を 4 箇所にばら撒く必要はない。

---

## 3. 全体像

```
┌── iOS (build N) ───────────────┐         ┌── API ───────────────────────────┐
│                                │         │                                  │
│ APIConfig.makeSession()        │         │  app.use("*", corsMiddleware)    │
│   httpAdditionalHeaders        │         │  app.use("*", clientVersionGuard)│ ← ★ 強制はここ
│     X-Atender-Client: ios/N    │────────▶│     ios/N かつ N < MIN → 426     │
│   ↑ 全リクエストに自動付与     │         │     それ以外は素通し (fail-open) │
│     (APIClient / AuthStore 両方)│         │                                  │
│                                │         │  GET /version   (gate 対象外)    │
│ 起動時 VersionStore.check()    │────────▶│    { commit, minIOSBuild }       │
│   N < minIOSBuild → .blocked   │         │  GET /healthz   (gate 対象外)    │
│                                │         │                                  │
│ 任意のリクエストが 426         │◀────────│  MIN_IOS_BUILD = 1 (コード定数)  │
│   → .blocked                   │         └──────────────────────────────────┘
│                                │
│ .blocked → VersionGateView     │
│   (全画面ブロック)             │
└────────────────────────────────┘
```

### 2 経路を持つ理由 (冗長ではなく役割が違う)

| 経路 | 役割 | これ単独では足りない理由 |
|---|---|---|
| 起動時 `/version` チェック | **UX**。何か操作する前に即ブロック画面を出す | 起動後に `MIN_IOS_BUILD` が上がった長寿命セッションを捕まえられない |
| API の 426 | **強制 (権威)**。次のリクエストで必ず止まる | 未ログインで何も叩かないユーザーはログインボタンを押すまで気付けない |

### 貫く原則

1. **フェイルオープン**: 判定できない入力 (ヘッダ無し / 形式不正 / `/version` 到達不能 / `CFBundleVersion` が非数値) は **必ず通す**。新設 middleware が本番を巻き込んで落とす余地を消すため。
2. **ゲート判定は `SOURCE_COMMIT` に依存しない**。commit は診断専用フィールド。F1 が万一この Coolify 版で効かなくても `commit: "unknown"` になるだけで、ゲートは完全に動く。**壊れ得る依存 (Coolify の env 注入) を、壊れても影響が診断に閉じる位置に置く。**
3. **後から足せるものは今足さない。後から足せないものだけ今入れる**。端末に residual するビルドに、ヘッダも起動時チェックも後付けできない。逆に `/version` のレスポンス項目追加や `MIN_IOS_BUILD` の値変更はサーバ側だけで完結する (Swift の `Codable` は未知キーを無視するので、フィールド追加は旧ビルドを壊さない)。

---

## 4. データモデル

### 4.1 API の定数 (compat matrix の実体)

```ts
// apps/api/src/lib/clientVersion.ts (新規)

/**
 * 受け入れる最小の iOS CFBundleVersion。これ未満を名乗るクライアントは 426 で弾く。
 *
 * ★ 初期値 1 の理由 (2026-07-17):
 *   - block は「そのビルドでは主要機能が壊れる / データを壊す」ときの最終手段。部分的な不具合は対象外
 *     (例: build 5 の room-week decode バグはルーム詳細のみの破損 → block しない。TestFlight の更新通知で足りる)
 *   - 実ビルドは 1 以上なので、初期値 1 は「誰も弾かれない」= 新設 middleware の本番誤爆余地がゼロ
 *   - 値の上げ方は .designs/20260717-version-management.md §9
 */
export const MIN_IOS_BUILD = 1;

export type ClientInfo = { platform: "ios"; build: number };
```

### 4.2 `/version` のレスポンス (shared Zod = 契約の正典)

```ts
// packages/shared/src/schemas/version.ts (新規)
import { z } from "zod";

export const VersionResponse = z.object({
  /** デプロイされている API の commit SHA。Coolify の SOURCE_COMMIT。取得不能なら "unknown" */
  commit: z.string(),
  /** API が受け入れる最小 iOS CFBundleVersion */
  minIOSBuild: z.number().int().positive(),
});

export type VersionResponse = z.infer<typeof VersionResponse>;
```

`packages/shared/src/index.ts` に `export * from "./schemas/version.js";` を追加 (既存の並びに合わせアルファベット順で `./schemas/userTimetable.js` の後)。

### 4.3 iOS の DTO

```swift
// apps/ios/Atender/Core/Models/DTOs.swift の末尾に追記 (fix/room-week-contract との衝突回避のため末尾)

struct VersionResponse: Codable, Equatable {
    let commit: String
    let minIOSBuild: Int
}
```

`commit` は表示・ログ用途のみで、iOS はパースも比較もしない (`"unknown"` / `"HEAD"` / 40-hex のいずれも来得るため — F2)。

### 4.4 iOS のゲート状態

```swift
// apps/ios/Atender/Core/Version/VersionGate.swift (新規)

enum VersionGateState: Equatable {
    case unknown                      // 未チェック / チェック失敗 → 通す
    case ok                           // 互換
    case blocked(minBuild: Int?)      // 非互換。minBuild は /version 経由なら既知、426 単独なら nil
}
```

---

## 5. API 仕様

### 5.1 `GET /version`

- 認証: **不要** (`Authorization` なしで 200)
- gate: **対象外** (これが弾かれると client は要求 build 数を知る手段を失う)
- 登録: `apps/api/src/routes/version.ts` (新規) → `index.ts` で `registerHealthRoutes(app)` の直後に `registerVersionRoutes(app)`
- パス: `/api/` prefix を付けず `/healthz` と同階層 (インフラ/メタ系の既存慣習に合わせる)

```ts
// apps/api/src/routes/version.ts
import type { Hono } from "hono";
import type { VersionResponse } from "@atender/shared";
import { MIN_IOS_BUILD } from "../lib/clientVersion";

export function registerVersionRoutes(app: Hono) {
  app.get("/version", (c) => {
    // ★ env.ts (import 時に一括 parse) を経由せず process.env を「リクエスト時に」読む。
    //   理由: env.ts は import 時に固定されるため、テストから実行時に差し替えられない
    //   (実績あり: knowledge/gotcha/env-module-import-time-parse-defeats-runtime-env-swap.md、
    //    known-failures の auth-apple テストがこれで it.skip 送りになっている)。
    //   ここで直読みすることで #V2/#V3 が in-process の Vitest で検証可能になる。
    const raw = process.env.SOURCE_COMMIT?.trim();
    const body: VersionResponse = {
      commit: raw && raw.length > 0 ? raw : "unknown",
      minIOSBuild: MIN_IOS_BUILD,
    };
    return c.json(body);
  });
}
```

レスポンス例:

```json
{ "commit": "3078d66f55a71496bd82dcfb2b97da7b4857892b", "minIOSBuild": 1 }
```

`env.ts` の `EnvSchema` は **変更しない** (`SOURCE_COMMIT` を足さない)。上記の理由で直読みするため、二重の入口を作らない。

### 5.2 `X-Atender-Client` ヘッダ (今やらないと後で不可能な唯一のもの)

- 形式: **`ios/<CFBundleVersion>`** ちょうど。`<CFBundleVersion>` は 1〜9 桁の 10 進数
- 例: `X-Atender-Client: ios/6`
- 送信主体: iOS のみ。**Web は送らない** → CORS の `Access-Control-Allow-Headers` は変更不要 (現状 `Content-Type` のまま)。将来 Web が送るなら preflight が落ちるので同時に追加が必要
- 拡張しない理由: marketing version (`1.0`) や OS 版数を今の形式に混ぜない。build 番号は単調増加する唯一の識別子でゲートに必要十分。追加情報が要るようになったら**別ヘッダを additive に足せばよく、それは将来ビルドでのみ可能** — つまり形式の作り込みに「今やらないと不可能」性は無い。ここで固定すべきは「全リクエストが client 版数を名乗る」ことだけ

```ts
// apps/api/src/lib/clientVersion.ts
const IOS_CLIENT_RE = /^ios\/(\d{1,9})$/;

/** 解釈できないものは全て null (= ゲート対象外)。フェイルオープン */
export function parseClientHeader(value: string | undefined): ClientInfo | null {
  if (!value) return null;
  const m = IOS_CLIENT_RE.exec(value.trim());
  if (!m) return null;
  return { platform: "ios", build: Number(m[1]) };
}
```

### 5.3 `clientVersionGuard` middleware

```ts
// apps/api/src/middleware/clientVersion.ts (新規)
import type { MiddlewareHandler } from "hono";
import { AppError } from "../lib/appError";
import { MIN_IOS_BUILD, parseClientHeader } from "../lib/clientVersion";

const EXEMPT_PATHS = new Set(["/healthz", "/version"]);

export const clientVersionGuard: MiddlewareHandler = async (c, next) => {
  if (EXEMPT_PATHS.has(c.req.path)) {
    return next();
  }
  const client = parseClientHeader(c.req.header("X-Atender-Client"));
  if (client && client.build < MIN_IOS_BUILD) {
    throw new AppError(
      426,
      "CLIENT_UPGRADE_REQUIRED",
      "このバージョンのアプリはサポートされていません。最新版に更新してください。",
      { platform: client.platform, build: client.build, minIOSBuild: MIN_IOS_BUILD },
    );
  }
  await next();
};
```

`index.ts` での登録位置:

```ts
app.use("*", corsMiddleware);
app.use("*", clientVersionGuard);   // ← 追加。cors の直後、全 route 登録より前
registerErrorHandler(app);
registerHealthRoutes(app);
registerVersionRoutes(app);         // ← 追加
// ... 以下既存のまま
```

- `corsMiddleware` が先: OPTIONS は cors が 204 で返しゲートに到達しない (preflight は弾かない)
- 全 route 登録より前: `/api/auth/*` も `/api/me` も対象。**古いビルドはログインすらできない** (中途半端に動いて壊れるより、更新を促す方が正しい)
- `AppError` を throw する: 既存 `registerErrorHandler` が `{error:{code,message,details}}` に整形する。ゲート専用のエラー形状を新設しない
- 426 の意味: RFC 7231 の 426 は本来プロトコル upgrade 用で `Upgrade` ヘッダが MUST。ここでは「アプリ版数が古い」の意味で使う業界慣習に乗る。`Upgrade` ヘッダは意味を成さないので付けない。**iOS 側は status 426 で判定**する (401 の扱いと対称)。body の `details` は curl / ログ用の診断であり、iOS は読まない (§6.3)

---

## 6. iOS 仕様

新規ディレクトリ `Atender/Core/Version/` と `Atender/Features/Version/`。`project.yml` の `sources: - Atender` がディレクトリを丸ごと拾うのでビルド設定の変更は不要。

### 6.1 `AppVersion` — 版数の読み取り (純関数 + 実バンドル配線)

```swift
// apps/ios/Atender/Core/Version/AppVersion.swift (新規)
import Foundation

enum AppVersion {
    /// CFBundleVersion 文字列 → build 番号。解釈できなければ nil (= 版数を名乗らない)
    static func build(from bundleVersion: String?) -> Int? {
        guard let trimmed = bundleVersion?.trimmingCharacters(in: .whitespaces), !trimmed.isEmpty else { return nil }
        return Int(trimmed)
    }

    /// 実バンドルの build。Info.plist は project.yml から生成される (正典は project.yml)
    static let current: Int? = build(from: Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String)

    static let clientHeaderField = "X-Atender-Client"

    /// build が無ければ nil = ヘッダを送らない (フェイルオープン)
    static func clientHeaderValue(build: Int?) -> String? {
        build.map { "ios/\($0)" }
    }
}
```

### 6.2 `APIConfig` — ヘッダ付与を session 生成 1 箇所に集約

```swift
// apps/ios/Atender/Core/Networking/APIConfig.swift (変更)
enum APIConfig {
    static let baseURL: URL = { /* 既存のまま */ }()
    static let authCallbackScheme = "atender"

    /// ★ アプリが API を叩く URLSession は必ずこれで作る。
    ///   X-Atender-Client の付与点はここ 1 箇所であり、APIClient / AuthStore / VersionStore の
    ///   すべてがこの session を共有する。
    ///   テストのスタブ session も必ずこれ経由で作ること (protocolClasses を渡す) — 自前で
    ///   URLSessionConfiguration を組むとヘッダが付かず「本番と違う経路」をテストすることになる。
    static func makeSession(protocolClasses: [AnyClass]? = nil) -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpShouldSetCookies = false
        configuration.httpCookieAcceptPolicy = .never
        configuration.httpCookieStorage = nil
        if let value = AppVersion.clientHeaderValue(build: AppVersion.current) {
            configuration.httpAdditionalHeaders = [AppVersion.clientHeaderField: value]
        }
        if let protocolClasses {
            configuration.protocolClasses = protocolClasses
        }
        return URLSession(configuration: configuration)
    }

    static let apiSession: URLSession = makeSession()
}
```

既存の cookie 無効化 3 行のコメント (better-auth の originCheck 対策) はそのまま維持する。
`httpAdditionalHeaders` が `URLProtocol` から観測できることは実測済 (F5)。

### 6.3 `VersionStore`

```swift
// apps/ios/Atender/Core/Version/VersionStore.swift (新規)
import Foundation
import Observation

@MainActor
@Observable
final class VersionStore {
    private(set) var state: VersionGateState = .unknown
    /// 診断表示用。/version 取得に成功していれば API の commit
    private(set) var apiCommit: String?

    let currentBuild: Int?

    @ObservationIgnored private let session: URLSession
    @ObservationIgnored private let decoder: JSONDecoder

    init(session: URLSession = APIConfig.apiSession, currentBuild: Int? = AppVersion.current) {
        self.session = session
        self.currentBuild = currentBuild
        self.decoder = JSONDecoder()
        self.decoder.keyDecodingStrategy = .useDefaultKeys
    }

    /// 起動時に 1 回。失敗しても state を変えない (フェイルオープン)
    func check() async { /* §8 #I3〜#I6 */ }

    /// APIClient が 426 を受けたときに呼ぶ。既知の minBuild があれば保持する
    func handleUpgradeRequired() { /* §8 #I7 */ }
}
```

状態遷移 (曖昧さを残さないため全遷移を定義):

| 現在 | 事象 | 次 |
|---|---|---|
| any | `handleUpgradeRequired()` | `.blocked(minBuild: 既存 .blocked(x) なら x、それ以外 nil)` |
| any | `check()` 成功 & `VersionGate.isBlocked == true` | `.blocked(minBuild: 応答の minIOSBuild)` |
| `.blocked` | `check()` 成功 & `isBlocked == false` | **`.blocked` のまま** (426 は権威。取り消さない) |
| `.unknown` / `.ok` | `check()` 成功 & `isBlocked == false` | `.ok` |
| any | `check()` 失敗 (transport / 非 2xx / decode 失敗) | **変更なし** |

### 6.4 `VersionGate` — 純ロジック

```swift
// apps/ios/Atender/Core/Version/VersionGate.swift (新規、VersionGateState と同ファイル)
enum VersionGate {
    /// currentBuild が不明なら false (通す)。境界は「>= は通す」
    static func isBlocked(currentBuild: Int?, minIOSBuild: Int) -> Bool {
        guard let currentBuild else { return false }
        return currentBuild < minIOSBuild
    }
}
```

### 6.5 `APIClient` — 426 の横取り

```swift
// apps/ios/Atender/Core/Networking/APIClient.swift (変更)
init(session: URLSession = APIConfig.apiSession,
     authStore: AuthStore,
     versionStore: VersionStore = VersionStore())   // ← 既定値付きで追加 (既存テストの呼び出しは無改修で通る)
```

`send(_:as:)` / `send(_:)` / `upload(...)` の 3 メソッドすべてで、**401 判定の前に**:

```swift
if status == 426 {
    versionStore.handleUpgradeRequired()
    throw APIError.upgradeRequired
}
```

**426 で `authStore.handleUnauthorized()` を呼んではならない** (§8 #I12)。426 は認証の失敗ではない。keychain を消すとゲート解除後に再ログインを強いることになる。

```swift
// apps/ios/Atender/Core/Networking/APIError.swift (変更)
enum APIError: Error, Equatable {
    case unauthorized
    case upgradeRequired          // ← 追加
    case api(status: Int, code: String, message: String)
    case http(status: Int)
    case decoding(String)
    case transport(String)
}
```

```swift
// apps/ios/Atender/Core/Networking/Error+UserFacing.swift (変更) — switch が網羅なので追加必須
case .upgradeRequired: return "アプリの更新が必要です。TestFlight から最新版に更新してください。"
```

### 6.6 `AppEnvironment` / `RootView`

```swift
// AppEnvironment.swift: authStore/queryClient 生成の直後に versionStore を作り、apiClient へ渡す
let versionStore = VersionStore()
self.versionStore = versionStore
self.apiClient = APIClient(authStore: authStore, versionStore: versionStore)
```

`AuthStore` は既定で `APIConfig.apiSession` を使うため (§6.2 で改修済)、`fetchMe` / `authRequestWithData` も自動的にヘッダを送る。AuthStore 自体のコード変更は **不要**。

```swift
// RootView.swift: 既存の Group 内を versionStore で分岐
Group {
    if case let .blocked(minBuild) = environment.versionStore.state {
        VersionGateView(currentBuild: environment.versionStore.currentBuild, minBuild: minBuild)
    } else {
        switch environment.authStore.state { /* 既存のまま */ }
    }
}
```

`.task` は **2 本並列**にする (version チェックが auth bootstrap を遅らせない):

```swift
.task { await environment.authStore.bootstrap() }
.task { await environment.versionStore.check() }
```

`AmbientBackground()` / `ToastOverlay()` / `.preferredColorScheme(...)` / `.onOpenURL` は既存のまま触らない。

---

## 7. UI/UX — 更新催促のブロッキング画面

### 7.1 どのデザイン言語で描くか (判断と根拠)

**標準 SwiftUI 部品 (`ContentUnavailableView`) で描く。現行の「Web 忠実移植」トークンは使わない。**

根拠:

1. **忠実移植規約の適用対象外**。規約は「Web (`apps/web`) の画面構成・トークンをそのまま写す」であり、写す対象がある画面に効く。**この画面は Web に存在しない** (Web に版数ゲートは不要 — reload で自己修復するため)。移植元が無いので「1:1 で移植」は定義できない
2. **UI 刷新 (別テーマ・未着手) の結論に依存しないで済む唯一の選択**。刷新は「規約の全面撤回」という承認ゲート待ちの案件で、`Space.selfTtChrome` 等の自前トークンは刷新で総取っ替えになる。標準部品は刷新後も書き直し不要 (むしろ findings ★5 が `EmptyState → ContentUnavailableView` を刷新の目標に挙げている方向そのもの)。**刷新の結論がどちらに転んでも捨てずに済む**
3. 自前部品を 1 個も増やさない。`ContentUnavailableView` は iOS 17.0+ で deployment target (17.0) を満たす

`ContentUnavailableView` は本来 empty state 用だが、「アイコン + タイトル + 説明 + アクション」の構造と HIG 準拠の余白/文字サイズが要件と一致するので流用する (意味の逸脱はこの 1 点)。

### 7.2 レイアウト

```
┌────────────────────────────────┐
│                                │
│                                │
│         ⬇ (SF Symbol           │
│    arrow.down.circle, 大)      │  ← L0: 何が起きたか
│                                │
│    アプリの更新が必要です      │  ← L0: title
│                                │
│  このバージョンは現在のサーバー │  ← L1: description (2行)
│  と通信できません。TestFlight  │
│  から最新版に更新してください。│
│                                │
│   ┌──────────────────────┐     │
│   │  TestFlight を開く   │     │  ← L2: action (canOpenTestFlight == true のときだけ)
│   └──────────────────────┘     │
│                                │
│      ビルド 6 / 必要 8 以上    │  ← L3: 診断 (.footnote, .secondary)
│                                │
└────────────────────────────────┘
```

- タブバー・ナビゲーションバー無し。**この画面から出る導線は「更新する」以外に無い** (ブロッキングの意味)
- `minBuild` が nil (426 単独で来た場合) の診断行は「ビルド 6」のみ

### 7.3 コンポーネント契約 (Reviewer が描画/ロジックを検証する単位)

```swift
// apps/ios/Atender/Features/Version/VersionGateView.swift (新規)
struct VersionGateView: View {
    let currentBuild: Int?
    let minBuild: Int?
    /// 既定は実 UIApplication 判定。テストは直接注入する
    var canOpenTestFlight: Bool = VersionGateView.canOpenTestFlightByDefault
    var onOpenTestFlight: () -> Void = VersionGateView.openTestFlightByDefault

    static let testFlightURL = URL(string: "itms-beta://")!
    static var canOpenTestFlightByDefault: Bool { UIApplication.shared.canOpenURL(testFlightURL) }
    static func openTestFlightByDefault() { UIApplication.shared.open(testFlightURL) }

    /// 診断行の文字列。純関数として切り出し、テストはここを検証する
    static func diagnosticsText(currentBuild: Int?, minBuild: Int?) -> String
}
```

`diagnosticsText` の仕様 (#I10):

| currentBuild | minBuild | 返り値 |
|---|---|---|
| 6 | 8 | `"ビルド 6 / 必要 8 以上"` |
| 6 | nil | `"ビルド 6"` |
| nil | 8 | `"必要 8 以上"` |
| nil | nil | `""` (診断行を描画しない) |

**TestFlight 導線の扱い**: `itms-beta://` は TestFlight を開く事実上の標準スキームだが Apple の公式ドキュメントに無い。よって:

- `project.yml` の `info.properties` に `LSApplicationQueriesSchemes: [itms-beta]` を追加する (iOS 9+ は宣言なしの `canOpenURL` が常に false を返すため、宣言しないとボタンが永久に出ない)
- **`canOpenTestFlight == false` ならボタンを出さない**。TestFlight 未インストール端末とシミュレータでは説明文だけになるが、説明文が「TestFlight から更新してください」と明示しているので導線は死なない
- つまりスキームが将来変わっても「押しても何も起きないボタン」は発生しない (フェイルセーフ)

### 7.4 `ui-ux-design-perspectives.md` §7 チェック

1. **視覚階層**: L0 = アイコン + タイトル (この画面唯一の主張) / L1 = 説明 / L2 = 単一アクション / L3 = 診断。`ContentUnavailableView` の既定階層に一致 (§1 の 3 段以内)
2. **タスク頻度 → 動線**: この画面のタスクは 1 つ (更新する)。0 タップで全情報が見え、1 タップで TestFlight へ。prominent ボタンは 1 個 (§4)
3. **token 参照先**: 標準部品 = system の text style / spacing。ハードコード数値ゼロ (§7.1 の理由により PJ トークンを参照しない)
4. **状態の網羅**: この画面自体は単一状態。ゲート全体の loading (= `.unknown`) は**この画面を出さない**ことで表現する (フェイルオープン、#I6)。error 状態も同様に「出さない」
5. **アクセシビリティ**: 標準部品なので tap target 44pt / Dynamic Type / コントラストは system 既定を継承。逸脱なし
6. **dark 対応**: `RootView` の `.preferredColorScheme` (既定 light) 配下に入る既存挙動をそのまま継承。この画面のために配色分岐を作らない
7. **ナビ構造**: §5 の表の「毎回同じ 1 タスク」= 1 画面 + 導線 1 本。階層 0 段
8. **数値の逸脱**: なし (数値を書いていない)

---

## 8. 挙動仕様

Reviewer はここからテストを生成する。`#` 番号をテスト名に含めること (例: `[version #G3]`)。

### API — `/version` (V)

- **#V1**: `GET /version` は 200 で `{ commit: string, minIOSBuild: number }` を返す
- **#V2**: `process.env.SOURCE_COMMIT = "3078d66f55a7..."` のとき `commit` はその値そのまま
- **#V3**: `SOURCE_COMMIT` が未設定 / 空文字 / 空白のみ のとき `commit === "unknown"`
- **#V4**: `Authorization` ヘッダ無しでも 200 (認証不要)
- **#V5**: `X-Atender-Client: ios/0` を付けても 200 (**ゲート対象外**)。426 にならない
- **#V6**: `minIOSBuild` は `MIN_IOS_BUILD` と一致し、1 以上の整数
- **#V7**: `commit` を iOS がパースしない契約なので、`"HEAD"` や `"unknown"` でも #V1 の型を満たす

### API — `clientVersionGuard` (G)

`MIN_IOS_BUILD` はテスト時 1。境界検証は `parseClientHeader` + `MIN_IOS_BUILD` の単体と、実 middleware 経由の両方で行う。

- **#G1**: `X-Atender-Client` **無し** → 素通し (既存挙動と完全に同一)。← Web と build ≤5 の iOS
- **#G2**: `ios/<build>` で `build > MIN_IOS_BUILD` → 素通し
- **#G3**: `ios/<build>` で `build < MIN_IOS_BUILD` → **426** + body `{ error: { code: "CLIENT_UPGRADE_REQUIRED", message: string, details: { platform: "ios", build, minIOSBuild } } }`
- **#G4** (境界): `build === MIN_IOS_BUILD` → **素通し** (`<` で弾く。`<=` ではない)
- **#G5**: 形式不正は**全て素通し** (フェイルオープン): `ios/abc` / `ios/` / `ios` / `ios/6/7` / `android/6` / `IOS/6` (大文字) / `""` / `ios/-1` / `ios/1234567890` (10 桁 = `\d{1,9}` 不一致)
- **#G6**: 前後空白は trim して判定する。`" ios/0 "` は **426** (`MIN=1` のとき)
- **#G7**: `/healthz` は `ios/0` を付けても 200 (ゲート対象外)
- **#G8**: `/api/auth/sign-in/magic-link` など**認証前の経路も**ゲート対象 — `ios/0` で 426
- **#G9**: ゲートは session middleware より先に効く。**token 無し + `ios/0` で `/api/me`** → **401 ではなく 426**
- **#G10**: 既存の全 API テストは `X-Atender-Client` を送らないので #G1 により無改修で緑のまま (regression ゼロ)

### iOS (I)

- **#I1**: `APIConfig.makeSession()` 由来の session で送るリクエストは `X-Atender-Client` を持ち、値は `^ios/\d+$` に一致する。**`APIClient` 経由と `AuthStore.fetchMe` (`/api/me`) 経由の両方**で検証する (= 配線のテスト。片方だけだと session 集約が効いている証明にならない)
- **#I2**: `AppVersion.build(from:)` — `"6"` → 6 / `" 6 "` → 6 / `"1.2.3"` → nil / `""` → nil / `nil` → nil / `"abc"` → nil
- **#I3**: `AppVersion.current` は nil でない。かつ `Bundle.main` の `CFBundleVersion` を `Int()` した値と一致する (project.yml → Info.plist → Bundle の配線)
- **#I4**: `VersionGate.isBlocked(currentBuild: 6, minIOSBuild: 8)` → true / `(8, 8)` → **false** (境界) / `(9, 8)` → false / `(nil, 8)` → **false** (判定不能は通す)
- **#I5**: `VersionStore.check()` がスタブ `{commit:"abc", minIOSBuild: 999}` を受け、build=6 → `state == .blocked(minBuild: 999)` かつ `apiCommit == "abc"`
- **#I6**: 同じく `minIOSBuild: 1` → `state == .ok`
- **#I7**: `check()` が失敗 (transport error / 500 / 壊れた JSON) → `state` は `.unknown` のまま (**起動をブロックしない**)
- **#I8**: `handleUpgradeRequired()` → `.blocked(minBuild: nil)`。`.blocked(minBuild: 999)` の状態で呼ぶと `.blocked(minBuild: 999)` を保持する
- **#I9**: `.blocked` の状態で `check()` が `minIOSBuild: 1` (互換) を返しても `.blocked` のまま (426 が権威)
- **#I10**: `VersionGateView.diagnosticsText` — §7.3 の表 4 パターン
- **#I11**: `APIClient.send` がスタブ 426 を受けたとき → `APIError.upgradeRequired` を throw し、`versionStore.state == .blocked(minBuild: nil)` になる
- **#I12**: 同じく 426 のとき **`authStore.state` は `.signedOut` にならない** (426 でサインアウトさせない)。401 のときだけ `.signedOut` になる既存挙動は不変
- **#I13**: `APIError.upgradeRequired.userFacingMessage == "アプリの更新が必要です。TestFlight から最新版に更新してください。"`

---

## 9. 運用ルール (`MIN_IOS_BUILD` をいつ上げるか)

**この定数が compat matrix の実体**であり、上げ方の規則がないと「誰も回さないつまみ」になる。

### 上げる条件 (すべて満たすとき)

1. API の変更によって、既存のある build 以下で **主要機能が使えなくなる**、または **データが壊れる**
2. その build のユーザーがアプリを使い続けると、黙って壊れる (エラーにすらならない) 危険がある

→ そのとき `MIN_IOS_BUILD` = **修正を含む最初の build 番号**。

### 上げない (= block しない) 例

- 一部画面の不具合 (例: build 5 の room-week decode 失敗 — ルーム詳細だけが死ぬ)。TestFlight の更新通知に任せる
- API の後方互換な追加 (フィールド追加 / enum 値追加)。iOS の enum は `UnknownFallbackRawRepresentable` で `.unknown` に落ちるので decode は壊れない (`Core/Models/Enums.swift`)
- Web だけに関係する変更

### 手順 (CLAUDE.md「主要ワークフロー」に追記する)

```
1. project.yml の CFBundleVersion を N に上げる (版数の正典。Info.plist は触らない)
2. 互換を壊す変更を含むなら apps/api/src/lib/clientVersion.ts の MIN_IOS_BUILD を N に上げる
   → ★ MIN_IOS_BUILD > 今から配る build にすると、配った直後に全員が 426 で自滅する。
     必ず「MIN_IOS_BUILD <= これから配る CFBundleVersion」を確認する
3. TestFlight へ archive → export → upload (既存手順)
4. API をデプロイ (main へマージすれば Web/API 両方が同一 commit で上がる)
5. curl https://atender-api.appily.run/version で minIOSBuild と commit を確認
```

CLAUDE.md への追記は §1「既に解決済み」の `118-119` 行 (project.yml が正典) の**直後に、新規の箇条書きとして足す** (既存記述と方向が同じ補足なので置換ではなく追記)。

### この設計の弱点 (正直に書く)

「1. 主要機能が使えなくなる」の判定は **人間が変更時に気付くこと** に依存している。気付き損ねを機械的に潰すのは契約テストの仕事であり、それは §10 の別テーマ。**本設計は「壊れたことに気付いた人が定数を上げられる」状態を作るだけで、「壊れたことに気付く」仕組みではない。**

---

## 10. DTO drift 検出を本設計に含めない判断 (と、その根拠)

### 判断: 含めない。別テーマとして次の設計 doc に送る

### 根拠

1. **版数管理と drift 検出は解く問題が違う**。版数管理 = 「壊れた組み合わせを**使わせない**」。drift 検出 = 「壊れた組み合わせを**作らない**」。findings ★11 が明言するとおり **版数を付けても drift は検出できない** — この事実は本設計でも変わらない。同じ doc に入れると「版数を入れたから契約は安全」という誤読を生む
2. **規模が違う**。手書き Swift DTO 953 行 × 51 エンドポイントに対する fixture 生成 + 配線テストの設計は、それ自体で 1 本の設計 doc になる。Muraki の「1 機能 = 1 設計 doc」に反する
3. **本設計は drift の被害を減らさないが、増やしもしない**。`/version` の DTO は新規 2 フィールドで、その配線は §8 #I5 でテストされる

### 次の doc への申し送り (本日の実測で findings の最小案は不十分と判明している)

findings の最小案は「shared の Zod から生成した JSON fixture を Swift の `Codable` decode テストに食わせる契約テスト」。
**この案のままでは本日見つかったバグ (`GET /api/rooms/:id/week` の `week` ラッパー) を捕まえられない**:

- fixture も `DTODecodingTests` も **正しく** (ラッパー無しで) 書かれており、9 ヶ月間ずっと緑だった
- 理由: decode テストは `decoder.decode(RoomWeekDto.self, from: fixture)` と **型を直書きする**。一方の本番経路は `client.send(Endpoints.roomWeek(...), as: RoomWeekResponse.self)` と **repository が `as:` に渡す型を通る**。テストは後者の型を **一度も実行しない**
- 欠陥は DTO 層でも APIClient 層でもなく、**両者を繋ぐ無テストの配線 (repository 層)** にあった

→ 次の doc の出発点は **「fixture を repository 経由 (`RoomRepository.roomWeek(...)` 等) で decode させる」**。
検証すべき対象は「DTO が fixture を decode できるか」ではなく **「repository が `as:` に渡している型が、その endpoint の実レスポンスを decode できるか」**。

**本設計はこの教訓をローカルに適用済**: §8 #I1 は `APIClient` 単体でなく `AuthStore.fetchMe` の実経路でもヘッダを検証し、#I5 は `VersionStore.check()` の実経路 (URL 組み立て → session → decode) を通す。DTO 単体の decode テストは書かない。

参考: 全 51 エンドポイントを実 DTO の `swiftc` コンパイル + live API 実レスポンスで突合した結果、契約不一致は room-week の 1 件のみ (2026-07-17 実測)。**drift の現在量は小さく、緊急ではない** — 別テーマに送っても被害は広がらない、という定量的裏付けでもある。

---

## 11. 不採用案

| 案 | 却下理由 |
|---|---|
| **`/v1` URL prefix** | 外部コンシューマがいて移行を強制できないときの道具。client は Web も iOS も**自分のもの**で、片方 (Web) は reload で強制移行でき、もう片方 (iOS) は URL でなく build 番号で識別すれば足りる。全 51 endpoint のパスを書き換える対価が無い |
| **changesets / semantic-release / release-please** | 全パッケージ `private: true` で publish 先も changelog 読者もゼロ。`CFBundleVersion` は semver ですらない (単調増加する整数)。**CI が 1 つも無いリポジトリ** (`.github/` 自体が無い) に Actions + conventional commits を導入して、整数 1 個をインクリメントすることになる |
| **API / Web に semver** | 読む consumer が存在しない。版数は既に `SOURCE_COMMIT` (40-hex) として存在し、Coolify が自動で注入する (F1)。人間が採番する版数を重ねても情報は増えない |
| **Firebase Remote Config** | 整数 1 個 (`MIN_IOS_BUILD`) のために SDK + Google 依存 + 初期化の非同期を持ち込む。同じ値は既存の API が `/version` で 1 行で返せる |
| **Markdown の compat matrix 表** | 間違っても何も壊れないので、腐ったことに誰も気付けない。本設計の `MIN_IOS_BUILD` は**間違えると 426 が出る / 出ない**という観測可能な結果を持つ (§8 #G3/#G4)。表でなくコードに置く理由がここにある |
| **Siren** | App Store の公開版数しか見ず、「**この build は今の API と喋れるか**」に答えない。TestFlight 配布中の現状では App Store に版数が存在しないので、そもそも動かない |
| **`latestIOSBuild` を `/version` に含める (findings の推奨から逸脱)** | (a) 最新 build 番号の事実は既に **ASC と project.yml** にあり、API に写すと **TestFlight アップロードのたびに手で同期する 2 つ目の定数**になる。忘れても何も壊れないので腐る = Markdown 表と同じ却下理由 (b) 使う UI が無い。ソフト更新催促は **TestFlight 自身が通知する** (c) `MIN_IOS_BUILD` は API 側で発生する**ポリシー**なので写しではない — この非対称が両者の扱いを分ける (d) 後から追加してもサーバ側だけで完結する (旧ビルドは未知キーを無視) ので「今やらないと不可能」ではない (§3 原則 3) |
| **`X-Atender-Client` に marketing version / OS 版数も詰める** | build 番号だけがゲートに必要十分。追加情報が要るなら**別ヘッダを additive に**足せる。ヘッダの「値の形式」に now-or-never 性は無く、now-or-never なのは「全リクエストが版数を名乗る」ことだけ (§5.2) |
| **User-Agent から build 番号を読んで旧ビルド (≤5) もゲートする** | URLSession の既定 UA に build 番号が入る形式は**未実測**。加えて、仮に識別できても **build ≤5 は催促画面をバイナリに持たない**ので、弾いた結果は「更新を促す画面」ではなく「原因不明で操作不能なアプリ」になる。旧ビルドを救う方法は存在しない — それがヘッダを今入れる理由そのもの |
| **`MIN_IOS_BUILD` を env 変数にする** | 「デプロイなしで緊急に上げられる」に見えるが、Coolify の env 変更もコンテナ再起動を伴い、コストはデプロイと変わらない。コード定数なら git log に「いつ・なぜ上げたか」が残り、値の変更が必ずレビューを通る |
| **`env.ts` の `EnvSchema` に `SOURCE_COMMIT` を足す** | `env.ts` は **import 時に一度 parse して固定**するため、テストから実行時に差し替えられない。この罠で既に `auth-apple` の 1 テストが `it.skip` 送りになっている (`gotcha/env-module-import-time-parse-defeats-runtime-env-swap.md`)。`/version` は `process.env` をリクエスト時に直読みして #V2/#V3 を検証可能にする (§5.1) |
| **`scenePhase` の foreground 復帰で再チェック** | 426 (§3) が同じ役目をより確実に果たす — 復帰しても API を叩かなければ危険は無く、叩けば必ず 426 で止まる。監視コードの追加分だけ損 |
| **ゲート判定を `commit` (SOURCE_COMMIT) で行う** | commit SHA には順序が無く「これ以上/以下」を表現できない。かつ Coolify の注入が失敗すると `"unknown"` になる (F2) — 壊れ得る入力にゲートを乗せることになる。判定は build 番号 (単調増加する整数、iOS 自身が知っている) で行い、commit は診断に閉じる (§3 原則 2) |
| **426 でなく 403 を使う** | どちらでも動くが、426 (Upgrade Required) の方が意図が status だけで読める。RFC 7231 の本来用途 (プロトコル upgrade、`Upgrade` ヘッダ MUST) からの逸脱は承知の上で、業界慣習に乗る。403 は既に `SETUP_REQUIRED` 等で使われており、status だけでは区別できなくなる |

---

## 12. 前提・依存・エスカレーション事項

### 本設計が依存する前提

- **P1**: `fix/room-week-contract` (in-flight worktree) の着地。着地しなくても本設計は動作するが、§9 の「上げない例」の記述が現実と合わなくなる
- **P2**: F1 (Coolify の `SOURCE_COMMIT` runtime 注入) が実際に稼働コンテナへ届いていること。
  - 実装レベルでは確定済: Researcher が **v4.1.2 タグ (= 本番稼働版と一致) の実装**で確認済 (`tool-quirk/coolify-api.md`)。Architect 側で main の実装 + 「`SOURCE_COMMIT` がユーザー定義 env に無い」ことを独立に再確認 (§2 F1)
  - 残る不確定は「稼働コンテナの env を直接読む」経路のみで、**Coolify には container exec API が存在しない**ため実測不能 (同 knowledge に明記あり)
  - **外した場合の被害は `commit: "unknown"` のみ。ゲートは無影響** (§3 原則 2)。§13-1 の 1 コマンドで確認する

### 依存しない (誤解防止)

- **known-failures A6/A7 (`zValidator` が raw ZodError を素通しし `ErrorResponse` 契約を破る) の裁定を待たない**。`/version` は入力を取らず `zValidator` を通らない。426 は `AppError` を throw して既存 `registerErrorHandler` の正しい envelope で返る。さらに **iOS は 426 の body を読まず status だけで判定する**ので、仮に envelope が壊れてもゲートは動く
- known-failures A1〜A5 / A8 も本設計の経路に無関係

### Leader が Touri に上げるべき点 (Muraki「エスカレーション」シグナル該当)

- **本設計は認証経路に middleware を挿す**。`clientVersionGuard` は `/api/auth/*` より前に立ち、古い client は **sign-in ごと 426 で止まる** (#G8)。CLAUDE.md の「設計が認証に触れる」に該当する
- **プロダクト判断**: 「部分的な機能破損では block しない」(§9) は仕様でなく思想で決まる。build 5 の room-week バグを block 対象にするかは Touri の裁定余地がある。Architect の推奨は **block しない** (block = アプリを使用不能にする最終手段であり、5 タブ中 1 タブの破損には不釣り合い。かつ build ≤5 はヘッダを送らないので**実際には block できない** — 設定しても効果ゼロの値を「効くつもり」で置くと、その前例が将来の過剰 block を生む)

---

## 13. 実装後の必須検証 (doc の注記は実行されないが、これは実行される)

### 13-1. 本番デプロイ後: `SOURCE_COMMIT` 注入の実測 (P2 を潰す)

```sh
curl -s https://atender-api.appily.run/version
```

| 返り値 | 意味 | 対応 |
|---|---|---|
| `commit` が 40 桁 hex | F1 成立。期待どおり | なし |
| `commit` が `"unknown"` / `"HEAD"` | Coolify の注入が効いていない (P2 が外れた) | **ゲートは無影響なのでロールバック不要**。Leader に報告し、commit 露出の代替 (build arg 有効化 = docker cache を毎コミット捨てる) を採るか判断 |

### 13-2. 本番でゲートの生死を確認する (`MIN_IOS_BUILD = 1` のまま、実ユーザーに影響なく)

```sh
curl -s -o /dev/null -w '%{http_code}\n' -H 'X-Atender-Client: ios/0' https://atender-api.appily.run/api/me
curl -s -o /dev/null -w '%{http_code}\n'                              https://atender-api.appily.run/api/me
```

| 1 本目 | 2 本目 | 判定 |
|---|---|---|
| **426** | **401** | ゲート生存 + 素通し経路も健在 (期待値) |
| 401 | 401 | **ゲートが効いていない** (middleware 未登録 / 順序ミス) |
| 426 | 426 | **素通しが壊れている** (Web を巻き込む重大事故 — 即ロールバック) |

`ios/0` は実在しない build なので実ユーザーに影響しない。**成功・失敗・未デプロイで返り値が全て異なる**ので判定できる (同じ値が返る無意味なプローブになっていないことを確認済)。

### 13-3. iOS 側ゲートの手動スモーク (自動テストで代替不能な部分)

**ゲートのクライアント側コードは端末に residual するので、リリース後に直せない。** 配布前に実物で 1 回動かす:

```sh
# 1. apps/api/src/lib/clientVersion.ts の MIN_IOS_BUILD を一時的に 999 にする
# 2. API 起動 (CLAUDE.md「主要ワークフロー」の手順どおり)
# 3. シミュレータでアプリ起動 → 更新催促画面が出ること / 下に時間割が透けないこと を確認
# 4. MIN_IOS_BUILD を 1 に戻す (★ 戻し忘れると本番で全員 426。コミット前に git diff で確認)
```

---

## 14. 変更ファイル一覧 (スコープ境界)

### 新規

| path | 内容 |
|---|---|
| `apps/api/src/lib/clientVersion.ts` | `MIN_IOS_BUILD` / `parseClientHeader` / `ClientInfo` |
| `apps/api/src/middleware/clientVersion.ts` | `clientVersionGuard` |
| `apps/api/src/routes/version.ts` | `GET /version` |
| `packages/shared/src/schemas/version.ts` | `VersionResponse` (Zod) |
| `apps/ios/Atender/Core/Version/AppVersion.swift` | build 読み取り + ヘッダ値生成 |
| `apps/ios/Atender/Core/Version/VersionGate.swift` | `VersionGateState` + `VersionGate.isBlocked` |
| `apps/ios/Atender/Core/Version/VersionStore.swift` | `@Observable` ゲート状態 + `check()` |
| `apps/ios/Atender/Features/Version/VersionGateView.swift` | 更新催促画面 |

### 変更

| path | 変更点 |
|---|---|
| `apps/api/src/index.ts` | `app.use("*", clientVersionGuard)` + `registerVersionRoutes(app)` |
| `packages/shared/src/index.ts` | `export * from "./schemas/version.js";` |
| `apps/ios/Atender/Core/Networking/APIConfig.swift` | `makeSession(protocolClasses:)` 追加、`apiSession` をそれ経由に |
| `apps/ios/Atender/Core/Networking/APIClient.swift` | `versionStore` 注入 + 3 メソッドで 426 横取り |
| `apps/ios/Atender/Core/Networking/APIError.swift` | `.upgradeRequired` 追加 |
| `apps/ios/Atender/Core/Networking/Error+UserFacing.swift` | `.upgradeRequired` の文言 |
| `apps/ios/Atender/Core/Models/DTOs.swift` | **末尾に** `VersionResponse` 追記 |
| `apps/ios/Atender/App/AppEnvironment.swift` | `versionStore` 生成・保持・`APIClient` へ注入 |
| `apps/ios/Atender/App/RootView.swift` | `.blocked` 分岐 + `.task` 追加 |
| `apps/ios/project.yml` | `CFBundleVersion` を次番号へ / `LSApplicationQueriesSchemes: [itms-beta]` 追加 |
| `CLAUDE.md` | §9 の運用手順を「主要ワークフロー」の TestFlight 節に追記 |

`CFBundleVersion` の値は**生成規則で決める** (手計算を doc に焼かない): **未使用の次番号**。本 doc 執筆時点の `project.yml` は `"5"` で ASC の最新も 5 なので通常は **6**。`MIN_IOS_BUILD` は §4.1 のとおり **1** で、`CFBundleVersion` とは連動しない (連動させると自ビルドを弾く事故になる)。

### 触らないもの (in-flight worktree との境界)

- `fix/room-week-contract` が触る `apps/ios/Atender/Core/Data/RoomRepositories.swift` と `DTOs.swift` の `RoomWeekResponse` 周辺 (本設計は DTOs.swift の**末尾のみ**に追記するので hunk が重ならない)
- `fix/ics-esm-import` の変更範囲 (`CLAUDE.md` 以外の重複なし)
- `apps/web` は **1 ファイルも変更しない** (Web はヘッダを送らず、ゲート対象でもない)
- `Atender/Info.plist` (生成物。`project.yml` が正典)

---

## 15. テスト基盤

### API — Vitest

- 配置: `apps/api/tests/version.test.ts` (新規)
- 実行: `cd apps/api ; pnpm exec vitest run tests/version.test.ts`
- ヘルパ: `tests/helpers/app` の `app`、`tests/helpers/http` の `json` / `expectError`
- ベースライン: `known-failures.md` の **17 failed / 273 passed (commit `f30391f`, 2026-07-16)**。本設計の追加後、**失敗テスト名の集合が変わらないこと**を確認する (#G10)
- `SOURCE_COMMIT` は `process.env` を直接 set / delete して検証する (§5.1 の設計により in-process で可能)。テスト間の汚染を避けるため `afterEach` で必ず `delete process.env.SOURCE_COMMIT`

### iOS — XCTest

- 配置: `apps/ios/AtenderTests/VersionGateTests.swift` (新規)
- 実行: `xcodegen generate` → `xcodebuild test -project Atender.xcodeproj -scheme Atender -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.2'`
- ベースライン: **174 GREEN / 0 RED** (commit `3078d66`, 2026-07-17 実測)。本設計で**意図的に壊れる既存テストは無い**
- スタブ: `APIClientTests.swift` の `StubURLProtocol` を再利用 (同一 target)

**Reviewer への必須指示 (ここを外すと偽陰性になる)**:

1. `StubURLProtocol.makeSession()` の中身を **`APIConfig.makeSession(protocolClasses: [StubURLProtocol.self])` に置き換える**。自前で `URLSessionConfiguration.ephemeral` を組むと `httpAdditionalHeaders` が付かず、**ヘッダのテストが「本番と違う経路」を検証してしまう** (この置換により `AuthStoreTests` / `AuthStoreCallbackTests` / `AttendanceFlowTests` も自動的に本番と同じ session 構成になる)。`httpAdditionalHeaders` が `URLProtocol` 側から観測できることは実測済 (F5)
2. **テストに build 番号のリテラル (`"ios/6"` / `6`) を書かない**。`AppVersion.current` や正規表現 `^ios/\d+$` で検証する。リテラルを書くと **TestFlight の版数を上げるたびにテストが赤くなる** (known-failures の「ロジックテストの顔をした結合」と同じ地雷。`DesignTokenTests` が `Space.selfTtChrome == 352` を焼き込んで刷新で全滅する構図と同型)
3. **DTO 単体の decode テストを増やさない**。`VersionResponse` は `VersionStore.check()` の実経路 (URL 組み立て → session → decode) を通して検証する (#I5)。§10 の教訓の適用
