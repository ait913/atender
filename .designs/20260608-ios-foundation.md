# Atender iOS — 土台アーキテクチャ + 段階ロードマップ + API 前提

## 目的 (1-3行)

Atender の iPhone ネイティブ版 (SwiftUI) を、いずれフル機能パリティ + ネイティブ品質に到達できる土台として立ち上げる。本 doc は「プロジェクト構成 / アーキテクチャ / Bearer 認証土台 / デザインシステム移植 / ナビ」を確定し、**Phase iOS-1 を実装着手できる粒度で詳細化**、iOS-2/3 は概要に留める。実装は Developer が後続で行う。

本 doc には 2 つの実装対象が含まれる:

- **(A) API 前提の先行実装分** (`apps/api` / `packages/shared`): Xcode 待ちの間に Leader が先に実装・検証する。TypeScript + Vitest でテスト可能な形で §8 に挙動仕様を明記。
- **(B) iOS Phase iOS-1 本体** (`apps/ios`): Xcode インストール後、Developer が着手。

---

## 1. プロジェクト構成

### 1.1 配置 / Xcode プロジェクト

- 置き場: 既存 atender monorepo 内 `apps/ios/`。1 プロダクト 1 リポジトリ、API 共有。pnpm workspace には含めない (Swift は別ビルド系)。
- Xcode プロジェクト形式: `.xcodeproj` を使う (`.xcworkspace` + CocoaPods は不採用、§10)。SPM 依存は `.xcodeproj` の Package Dependencies に直接追加。
- ターゲット名: `Atender` (アプリ本体ターゲット) / `AtenderTests` (ユニットテスト) / `AtenderUITests` (Phase iOS-1 では空雛形のみ、後続で使用)。
- **Bundle ID**: `net.appily.atender` (本番)。開発ビルドは同一 (Debug/Release の scheme 分けで対応、別 bundle id は当面作らない)。
- **Display Name**: `Atender`
- **最小 iOS バージョン**: **iOS 17.0**。
  - 理由: Observation framework (`@Observable` マクロ)・`ScrollView` の `scrollPosition`・`ContentUnavailableView`・`.presentationDetents` の安定版・`onChange(of:)` 新シグネチャを前提にしたいため。iOS 16 を切ることで MVVM の boilerplate を Observation で消せる。2026 年時点で iOS 17 未満のシェアは学生層では無視できる範囲。
  - Deployment Target = 17.0 を `Atender` ターゲットに設定。
- Swift 言語バージョン: Swift 6 (ただし Strict Concurrency は `Minimal` で開始。Phase iOS-1 では `actor` 過剰適用を避け、UI は `@MainActor` 既定、ネットワークは async/await で素直に書く。Complete 化は iOS-2 以降の余裕時)。
- インターフェース: SwiftUI App lifecycle (`@main struct AtenderApp: App`)。Storyboard / UIKit AppDelegate は使わない (Apple Sign-In の callback も SwiftUI の `.onOpenURL` / AuthenticationServices で完結)。
- 向き: Portrait のみ (iPhone 縦。iPad は Phase 外、universal にはするが最適化しない)。

### 1.2 SPM 依存 (最小)

URLSession 中心。追加は理由が立つもののみ:

| パッケージ | 用途 | 採否 | 理由 |
|---|---|---|---|
| (なし: URLSession) | HTTP / JSON | 採用 | Alamofire は不要。`async` URLSession で足りる |
| (なし: Security.framework) | Keychain | 採用 | システム framework。トークン保存は自前 `KeychainStore` ラッパで Security API を直叩き。KeychainAccess 等の外部ライブラリは入れない (薄いので) |
| (なし: AuthenticationServices) | Apple Sign-In / Google OAuth web flow | 採用 | システム framework。`ASAuthorizationAppleIDProvider` + `ASWebAuthenticationSession` |

- **Phase iOS-1 では外部 SPM 依存ゼロ**を目標とする。チャート / カレンダーライブラリは Phase iOS-2 で必要になったら理由付きで再評価 (Swift Charts はシステム framework なので候補)。

### 1.3 フォルダ構成

Xcode の group をディスク構造とミラーさせる (group = フォルダ)。

```
apps/ios/
├── Atender.xcodeproj
├── .gitignore                      # Xcode 用 (§1.4)
├── README.md                       # ビルド手順 / scheme / env 切替
├── Atender/
│   ├── AtenderApp.swift            # @main, RootView 注入, DI 組み立て
│   ├── Info.plist                  # URL Types (atender scheme), Sign in with Apple capability 参照
│   ├── Assets.xcassets/            # AppIcon, AccentColor, Color Set (DesignSystem が参照)
│   ├── App/
│   │   ├── RootView.swift          # AuthState による分岐 (signedOut → AuthView / signedIn → MainTabView)
│   │   ├── MainTabView.swift       # TabView (Phase iOS-1 は Today/Timetable/Settings の 3 tab)
│   │   └── AppEnvironment.swift    # 環境値 (APIClient, AuthStore 等) の集約注入点
│   ├── Core/
│   │   ├── Networking/
│   │   │   ├── APIClient.swift      # 型付き HTTP, Bearer 付与, デコード, 401 ハンドリング
│   │   │   ├── APIEndpoint.swift    # エンドポイント定義 (path/method/query/body)
│   │   │   ├── APIError.swift       # エラー型 (web client.ts の ApiError ミラー)
│   │   │   └── APIConfig.swift      # baseURL (Debug=local / Release=prod), scheme 定数
│   │   ├── Auth/
│   │   │   ├── AuthStore.swift      # @Observable, 認証状態 + サインイン/アウト
│   │   │   ├── KeychainStore.swift  # Security.framework ラッパ (save/load/delete token)
│   │   │   ├── GoogleSignIn.swift   # ASWebAuthenticationSession による web OAuth flow
│   │   │   └── AppleSignIn.swift    # ASAuthorizationAppleIDProvider → idToken
│   │   ├── DesignSystem/
│   │   │   ├── Theme.swift          # Color/spacing/radius/typography トークン (styles.css ミラー)
│   │   │   ├── Color+Atender.swift  # status / accent / bg 色
│   │   │   ├── Typography.swift     # Minor Third scale + Dynamic Type
│   │   │   └── Components/          # 共通 View (StatusDot, EventTile, BottomSheet modifier, Chip)
│   │   └── Models/
│   │       ├── DTOs.swift           # shared Zod ミラーの Codable 群 (§4)
│   │       ├── Enums.swift          # AttendanceStatus 等 enum ミラー
│   │       └── ModelSync.md         # ★ 出典明記: どの shared schema をミラーしたか
│   └── Features/
│       ├── Auth/
│       │   └── AuthView.swift       # サインイン画面 (Google / Apple ボタン)
│       ├── Today/
│       │   ├── TodayView.swift
│       │   ├── TodayViewModel.swift # @Observable
│       │   └── OccurrenceRow.swift
│       ├── Timetable/
│       │   ├── TimetableView.swift
│       │   ├── TimetableViewModel.swift
│       │   └── MeetingBlock.swift
│       └── SemesterOverview/
│           ├── SemesterOverviewView.swift
│           └── SemesterOverviewViewModel.swift
└── AtenderTests/
    ├── DTODecodingTests.swift
    ├── APIClientTests.swift
    └── Fixtures/                    # 実 API レスポンス JSON サンプル
```

### 1.4 Git 管理 (.gitignore for Xcode)

`apps/ios/.gitignore` を新規作成 (atender repo のルート .gitignore とは別に、apps/ios 配下用):

```gitignore
# Xcode
build/
DerivedData/
*.xcuserstate
xcuserdata/
*.xcscmblueprint
*.xccheckout
# SPM
.swiftpm/
Package.resolved        # ← 依存ゼロ方針のため当面は無視。依存追加時に再判断 (コメント残す)
# macOS
.DS_Store
# 機密
*.xcconfig.local        # env / secret は xcconfig.local で注入、コミットしない
```

- `project.pbxproj` は **コミットする** (Xcode プロジェクト構造の真実)。
- 認証 secret (Google client id 等) はコードに直書きせず `Debug.xcconfig` / `Release.xcconfig` の build setting で渡し、`*.local` を gitignore。Phase iOS-1 で必要なのは「baseURL」「Google OAuth client id (iOS 用)」「URL scheme」のみ。

---

## 2. アーキテクチャ

### 2.1 全体方針

- **SwiftUI + Observation (`@Observable`)** を採用。iOS 17 前提なので `ObservableObject` / `@Published` は使わず `@Observable` マクロ + `@State` で持つ。ViewModel は `@Observable final class XxxViewModel`。
- 軽量 **MVVM**: View はレイアウト + binding のみ、画面状態と API 呼び出しは ViewModel。ロジックが薄い画面 (Auth) は ViewModel を作らず View + AuthStore 直結で良い (過剰な層を作らない = Touri 流ミニマル)。
- **async/await** で統一。completion handler / Combine は使わない。
- 並行性: ネットワーク呼び出しは `APIClient` の `async` メソッド。ViewModel のメソッドは `@MainActor`、その中で `await apiClient.xxx()` を呼ぶ (URLSession の await は自動でバックグラウンド、結果反映は MainActor)。

### 2.2 DI (依存注入)

- `AppEnvironment` を 1 つ作り、`APIClient` と `AuthStore` を保持。`AtenderApp` で生成し、`.environment(...)` で SwiftUI 環境に流す。
- ViewModel はイニシャライザで `APIClient` を受け取る (テスト時にモック差し替え可能にするため)。環境値からの取得は View 層で行い ViewModel に渡す。
- グローバルシングルトンは作らない (テスト容易性のため)。`AuthStore` のみ実質アプリ単一だが、これも `AppEnvironment` 経由で注入。

### 2.3 APIClient 設計

```swift
// APIConfig.swift
enum APIConfig {
    static let baseURL: URL = {
        #if DEBUG
        return URL(string: "http://localhost:8787")!   // ローカル API
        #else
        return URL(string: "https://atender-api.appily.run")!
        #endif
    }()
    static let authCallbackScheme = "atender"            // atender://auth
}
```

```swift
// APIEndpoint.swift
struct APIEndpoint {
    let path: String                       // "/api/today"
    let method: HTTPMethod                 // .get / .post / .patch / .delete
    var query: [String: String] = [:]
    var body: Encodable? = nil
    var requiresAuth: Bool = true          // false は /api/auth/* の一部
}
enum HTTPMethod: String { case get = "GET", post = "POST", patch = "PATCH", delete = "DELETE" }
```

```swift
// APIClient.swift
@Observable
final class APIClient {
    private let session: URLSession
    private let authStore: AuthStore       // Bearer トークン取得 + 401 通知用
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    init(session: URLSession = .shared, authStore: AuthStore) { ... }

    func send<T: Decodable>(_ endpoint: APIEndpoint, as type: T.Type) async throws -> T
    func send(_ endpoint: APIEndpoint) async throws            // 204 / レスポンスボディ不要
}
```

- `send` の処理順: URL 構築 (baseURL + path + query) → `requiresAuth` なら `Authorization: Bearer <token>` を付与 → body があれば JSON encode + `Content-Type: application/json` → `URLSession.data(for:)` → ステータス判定:
  - 2xx かつ 204 → ボディなし版は成功 return、`as` 版は `EmptyResponse` 不可なので呼び分け。
  - 2xx → `decoder.decode(T.self, from: data)`。デコード失敗は `APIError.decoding`。
  - 401 → `authStore.handleUnauthorized()` を呼び (= signedOut へ遷移)、`APIError.unauthorized` を throw。
  - その他 → レスポンスボディを `{ "error": { code, message, details } }` として best-effort デコードし `APIError.api(status, code, message)`、デコード不能なら `APIError.http(status)`。
- `JSONDecoder`: `keyDecodingStrategy = .useDefaultKeys` (API は camelCase なのでそのまま)。日付は **ISO 文字列を `String` のまま受ける** (§4.3 参照、`.dateDecodingStrategy` は使わない)。

### 2.4 APIError 型 (web `ApiError` ミラー)

```swift
enum APIError: Error, Equatable {
    case unauthorized                              // 401
    case api(status: Int, code: String, message: String)
    case http(status: Int)
    case decoding(String)
    case transport(String)                         // URLSession 例外
}
```

### 2.5 オフライン / キャッシュ

- **Phase iOS-1 では永続キャッシュ・オフライン対応は実装しない** (必須でない)。各 ViewModel が `@Observable` でメモリ保持し、画面表示時に fetch。`refreshable` で pull-to-refresh。
- 楽観的更新は出席記録ループのみ採用 (§7.4): タップ即時にローカル状態を更新 → API 呼び出し → 失敗時ロールバック + トースト。
- 本格的なオフライン (SwiftData / 永続キャッシュ) は Phase iOS-2 以降の検討事項として明記し、ここでは作らない。

---

## 3. 認証フロー (土台の肝)

現状 web は Cookie session (`credentials: "include"`)。ネイティブは Cookie を使わない方針なので、**better-auth `bearer` plugin** を API に追加し、トークンを Keychain 保持 → 全リクエストに `Authorization: Bearer <token>` を付与する。

### 3.1 better-auth bearer plugin の挙動 (Researcher 確認済)

- `bearer()` plugin を `plugins` に追加すると、サインイン系レスポンスの `set-auth-token` ヘッダに session token が乗り、以降 `Authorization: Bearer <token>` ヘッダで `auth.api.getSession()` がそのトークンを解決できるようになる。
- bearer は **既存の Cookie session と共存可能**。web (Cookie) はそのまま、ネイティブ (Bearer) を追加で受けられる。
- トークンの実体は session token (DB session 行に対応)。30 日 expiry / updateAge 1 日は既存設定を踏襲。

### 3.2 サインイン方式 (ネイティブ)

#### Apple Sign-In (AuthenticationServices, ネイティブ idToken)

1. `ASAuthorizationAppleIDProvider().createRequest()` で `requestedScopes = [.fullName, .email]`。`SignInWithAppleButton` (SwiftUI) で起動。
2. 成功すると `ASAuthorizationAppleIDCredential.identityToken` (= idToken, JWT) と `authorizationCode` が取れる。
3. これを better-auth の **ID Token サインイン経路**に渡す:
   `POST /api/auth/sign-in/social` body `{ "provider": "apple", "idToken": { "token": "<identityToken>" } }`。
   - better-auth は apple social provider 設定があれば idToken を検証し、User/Account を作成 or 紐付け、session を発行。`set-auth-token` ヘッダで token を返す。
4. 初回のみ `fullName` が取れる (Apple 仕様)。`me.user.name` が空なら取得した名前で `PATCH /api/me` する (Phase iOS-1 では name 補完は任意、空でも setup フローで補完可)。

#### Google Sign-In (ASWebAuthenticationSession による web OAuth)

Phase iOS-1 は **web OAuth flow** を採用 (Google SDK / GoogleSignIn-iOS は入れない = SPM 依存ゼロ方針):

1. `POST /api/auth/sign-in/social` body `{ "provider": "google", "callbackURL": "atender://auth" }` → レスポンス `{ "url": "<google consent url>", "redirect": true }`。
2. `ASWebAuthenticationSession(url: googleURL, callbackURLScheme: "atender")` を起動。`prefersEphemeralWebBrowserSession = false` (アカウント記憶のため)。
3. ユーザーが同意 → better-auth の callback (`/api/auth/callback/google`) 処理後、`atender://auth?...` にリダイレクト。
4. **トークン受け渡しの確定方式** (§8.4 で API 側対応): callback 後にネイティブが `GET /api/auth/token` (bearer plugin が提供する、Cookie or 直前 session から token を返すエンドポイント) を叩いて token を取得する経路を使う。ただし ASWebAuthenticationSession は ephemeral でない限り Cookie をアプリと共有しないため、**Google は「callback redirect に token を載せる」方式を API 側で用意する**のが確実 (§8.4)。
   - 確実な経路: API に **ネイティブ専用 callback ラッパ** `GET /api/auth/native/google/start?callback=atender://auth` を用意せず、better-auth 標準の social sign-in で得た redirect URL を使い、**callback 完了画面で token をフラグメントに載せて `atender://auth#token=<...>` を返す**薄い中継ハンドラを API 側に追加する (§8.4 に挙動仕様)。
5. ネイティブは `atender://auth` の URL から token を抽出 → Keychain 保存 → 認証完了。

> 設計判断: Google の「Cookie をネイティブに渡せない」問題は、**API 側に小さな中継エンドポイントを足す**ことで解決する (§8.4)。Apple は idToken 直渡しなので中継不要。Phase iOS-1 の Google は web flow + 中継で確定し、ネイティブ Google SDK は採用しない (依存削減)。

### 3.3 Keychain 保存

```swift
// KeychainStore.swift
struct KeychainStore {
    private let service = "net.appily.atender.auth"
    private let account = "session-token"
    func save(token: String) throws       // SecItemAdd / SecItemUpdate
    func load() throws -> String?          // SecItemCopyMatching
    func delete() throws                   // SecItemDelete
}
```

- `kSecClass = kSecClassGenericPassword`, `kSecAttrAccessible = kSecAttrAccessibleAfterFirstUnlock` (バックグラウンド fetch を将来許すため、`WhenUnlocked` でなく `AfterFirstUnlock`)。
- 保存値は session token 文字列のみ。

### 3.4 AuthStore (状態 + 全リクエスト Bearer 付与の供給源)

```swift
@Observable
final class AuthStore {
    enum State: Equatable { case unknown, signedOut, signedIn }
    private(set) var state: State = .unknown
    private let keychain: KeychainStore

    var token: String? { ... }                          // APIClient が同期取得
    func bootstrap() async                              // 起動時: Keychain に token あれば signedIn 候補 → /api/me で検証
    func signInWithApple(idToken: String) async throws
    func startGoogleSignIn() async throws -> URL        // social url 取得
    func completeGoogleSignIn(callbackURL: URL) throws  // atender://auth#token=... を解析 → 保存 → signedIn
    func handleUnauthorized()                           // 401 受信時: token 破棄 → signedOut
    func signOut() async                                // POST /api/auth/sign-out → Keychain delete → signedOut
}
```

- 起動フロー (`bootstrap`): Keychain に token があれば `Authorization: Bearer` を付けて `GET /api/me` → 200 なら `signedIn`、401 なら token 破棄して `signedOut`。token なしは即 `signedOut`。
- 401 時の扱い: `APIClient` が任意の API で 401 を受けたら `handleUnauthorized()` を呼ぶ → `state = .signedOut` → `RootView` が AuthView に切替。再認証は再サインイン (silent refresh は Phase iOS-1 では行わない。token 30 日なので実用上問題なし)。

### 3.5 ネイティブ redirect scheme

- `Info.plist` の `CFBundleURLTypes` に scheme `atender` を登録。callback は `atender://auth`。
- better-auth `trustedOrigins` に `atender://auth` (および scheme バリエーション) を追加する (§8.3)。

---

## 4. データモデル (shared Zod DTO → Swift Codable ミラー)

### 4.1 ミラー方針

- `packages/shared/src/schemas/*.ts` の Zod を**唯一の真実**とし、Swift `Codable` で**手動ミラー**する。
- 各 Swift struct のドキュメントコメントに **出典 (`// mirror of packages/shared/src/schemas/<file>.ts <TypeName>`)** を必ず書く。`Core/Models/ModelSync.md` に対応表を集約 (どの schema をどの Swift 型にミラーしたか、最終同期日)。
- 将来の自動生成余地: shared Zod から Swift Codable を生成する手段 (例 `zod-to-json-schema` → `quicktype`) は **Phase iOS-3 以降の検討事項**として明記。Phase iOS-1〜2 は手動ミラー (型数が少なく、API が安定しているため手動で十分)。

### 4.2 命名 / null / enum

- フィールド名は API の camelCase をそのまま Swift プロパティ名にする (`keyDecodingStrategy = .useDefaultKeys`)。
- Zod `.nullable()` → Swift `Optional` (`String?`)。`.optional()` (キー自体が欠ける可能性) も `Optional` + `decodeIfPresent`。両者を Swift では `Optional` に畳む (区別不要、エンコード時は省略でなく `null` 許容)。
- enum はミラー専用 Swift enum (`String, Codable`)。未知値はデコード失敗にせず `.unknown` フォールバックを持たせる (API 側 enum 追加で即クラッシュしないため)。例:

```swift
enum AttendanceStatus: String, Codable {
    case present = "PRESENT", absent = "ABSENT", excused = "EXCUSED"
    case tardy = "TARDY", earlyLeave = "EARLY_LEAVE", cancelled = "CANCELLED"
}
```

### 4.3 日付の扱い

- API の日付は **ISO 8601 文字列** (`createdAt: "2026-06-08T..."`) と **`YYYY-MM-DD` 文字列** (`date`, `startDate`) の 2 種。
- Swift では**両方 `String` のまま保持**し、表示・計算が必要な箇所で `ISO8601DateFormatter` / 自前パーサで `Date` に変換する (Codable の `dateDecodingStrategy` は使わない。混在形式で破綻するため)。
- `YYYY-MM-DD` のローカル日付計算は JST 前提 (API が JST で返す。§7 の Today はサーバが date を返すのでクライアントで日付生成しない)。

### 4.4 Phase iOS-1 で必要な型 (列挙)

| Swift 型 | 出典 schema | 用途 |
|---|---|---|
| `MeResponse` (`user`, `setupStatus`) | me route `getMeResponse` 形 (schema 化されていないので route から手起こし。下記) | 起動時検証 / setup 判定 |
| `SetupStatus` (`hasSchool/hasDepartment/hasSemester/hasUserTimetable/isComplete`) | 同上 | setup 完了判定 |
| `SemesterDto` | `semester.ts` | 学期 |
| `SemesterOverviewDto` (`overall`, `days[]`, `courses[]`) | `semester.ts` | 学期出席概要 |
| `AttendanceDaySummary` | `semester.ts` | 概要カレンダーの日別 |
| `CourseStatsDto` | `stats.ts` | 科目別出席率 |
| `UserTimetableDto` (`daySlots[]`, `courses[]`, `meetings[]`) | `userTimetable.ts` | 時間割表示 |
| `DaySlotDto` / `CourseDto` / `MeetingDto` | `template.ts` | 時間割構成要素 |
| `OccurrenceDto` | `attendance.ts` | Today の授業コマ |
| `TodayResponse` (`date`, `occurrences[]`) | `attendance.ts` | Today 取得 |
| `MarkAttendanceInput` / `MarkAllPresentInput` / `MarkAllPresentResponse` | `attendance.ts` | 出席記録 |
| `AttendanceStatus` enum | `enums.ts` | 出席状態 |
| `ErrorResponse` (`error.code/message/details`) | `api.ts` | エラーデコード |

> `MeResponse` は shared に Zod schema が無く me route 内のオブジェクトリテラル。Phase iOS-1 着手前に **API 側で `packages/shared/src/schemas/me.ts` に `MeResponseDto` を追加**しておくと Swift ミラーの出典が明確になる (§8.5、任意だが推奨)。なければ route の形を手起こしで Swift に写し、ModelSync.md に「route 手起こし」と明記。

---

## 5. デザインシステム移植 (styles.css → SwiftUI Theme)

### 5.1 カラー

`styles.css` の CSS 変数を SwiftUI に移植。dark を既定、light を OS 追従。

- 方式: **Asset Catalog の Color Set (Any/Dark Appearance) + `Color(_:)` 参照**を基本にしつつ、rgba/動的値が多いので **`Color` の computed 拡張 (`Color.bgBase` 等) で `UITraitCollection` から dark/light 解決**する `Color+Atender.swift` を用意。Color Set にできるソリッド色 (status 系) は Assets に、rgba/alpha 合成が要るもの (border-subtle 等) はコードで定義。
- マッピング (主要):

| トークン | dark | light |
|---|---|---|
| `bgBase` | #0B0E14 | #F9F9F9 |
| `bgMuted` | #14181F | #F2F2F2 |
| `bgElevated` | #1A1F2A | #FFFFFF |
| `textPrimary` | #F5F6F8 | #0F172A |
| `textSecondary` | white 72% | slate 72% |
| `textTertiary` | white 52% | slate 58% |
| `accent` (500) | #F97316 | #EA580C |
| `statusPresent` | #34D399 | #16A34A |
| `statusAbsent` | #FF5C7A | #DC2626 |
| `statusExcused` | #5AA9FF | #2563EB |
| `statusTardy` | #FFC93C | #D97706 |
| `statusEarly` | #C685FF | #9333EA |
| `statusCancelled` | white 30% | slate 40% |
| `statusNone` | white 18% | slate 18% |

- `AttendanceStatus` → status color のマッピング関数を 1 箇所 (`Color.forStatus(_:)`) に置く。
- dark の body 背景 radial グラデ (orange/purple) は Phase iOS-1 では**省略可** (単色 bgBase で開始)。再現するなら背景に `RadialGradient` を重ねるが優先度低。

### 5.2 spacing / radius

```swift
enum Space {
    static let s0_5: CGFloat = 2, s1: CGFloat = 4, s2: CGFloat = 8, s3: CGFloat = 12
    static let s4: CGFloat = 16, s5: CGFloat = 20, s6: CGFloat = 24, s8: CGFloat = 32
}
enum Radius {
    static let sm: CGFloat = 10, md: CGFloat = 18, lg: CGFloat = 24, xl: CGFloat = 28
    static let timetableCell: CGFloat = 8
}
```

- semantic: `pagePadding = 12` (mobile), `cardPadding = 12`, `sectionGap = 16`, `tabBarHeight = 64` 相当。safe-area は SwiftUI が自動処理。

### 5.3 typography (Minor Third 1.20 + Dynamic Type)

- フォント: `Inter` を bundle 同梱 (`Info.plist` の `UIAppFonts` に登録)。和文は `Noto Sans JP` 同梱は重いので **Phase iOS-1 では和文はシステム (San Francisco / ヒラギノ) にフォールバック**、Inter は欧文・数字用。
- サイズ: `--text-xs..5xl` (11/13/14/17/20/24/30/36/44px) を `Font` の拡張で定義。**Dynamic Type 対応**として `Font.custom("Inter", size:, relativeTo:)` を使い、各サイズに最も近い `TextStyle` を `relativeTo` に指定 (base=`.body`, lg=`.headline`, xl=`.title3`, 2xl=`.title2`, 3xl=`.title`)。これでユーザーの文字サイズ設定に追従する。
- weight: regular/medium/semibold/bold/black を Inter の対応ウェイトにマップ。

### 5.4 共通コンポーネント (Swift 版方針)

| web | Swift | Phase iOS-1 |
|---|---|---|
| StatusDot / 出席状態の色 dot | `StatusDot(status:)` View | ◯ |
| EventTile (科目ブロック) | `EventTile(occurrence:)` / `MeetingBlock(meeting:)` | ◯ (Today/Timetable で使用) |
| BottomSheet (3-way close) | `.sheet` + `.presentationDetents` の薄い modifier `bottomSheet(...)`。背景タップ close はシステム標準 (drag + 背景タップで dismiss) | iOS-1 では出席ステータス変更くらいで使用、本格 Sheet 群は iOS-2 |
| Chip (ContextChips/DayChips 等) | `Chip(label:selected:)` | iOS-1 は最小 (学期切替程度)、本格は iOS-2 |
| Button (primary/secondary) | `AtenderButton` ViewModifier or 共通スタイル | ◯ |

- `modal-sheet-base-component-3way-close` の知見: SwiftUI の `.sheet` は drag-to-dismiss + 背景タップ dismiss が標準で備わるので、web のような自前 3-way close 実装は不要。`.presentationDetents([.medium, .large])` で高さ制御。これは設計上の利点 (web の苦労がネイティブで自動解決)。

---

## 6. ナビゲーション

### 6.1 ルート分岐 (RootView)

```
RootView
├── AuthStore.state == .unknown   → 起動スプラッシュ (ProgressView, bootstrap 中)
├── .signedOut                    → AuthView (Google / Apple)
└── .signedIn
     ├── setupStatus.isComplete == false → SetupView (Phase iOS-1 では最小: 「Web で初期設定してね」誘導 or 簡易 setup。§7.5)
     └── true                              → MainTabView
```

### 6.2 MainTabView (Phase iOS-1 = 3 tab)

web は 5 tab (ホーム/学期・科目/ルーム/友達/設定)。**Phase iOS-1 は読み取り + 出席ループに絞り 3 tab**:

```
TabView
├── Today      (今日)    SF Symbol: "checklist"      → TodayView
├── Timetable  (時間割)  SF Symbol: "calendar"       → TimetableView
└── Settings   (設定)    SF Symbol: "gearshape"      → SettingsView (最小: アカウント / サインアウト / テーマ)
```

- web の「ホーム」は時間割タブ + カレンダータブの複合だが、iOS-1 では **Today (出席ループの主役) と Timetable (週グリッド表示) を独立 tab に分離**。学期出席概要 (SemesterOverview) は **Timetable tab 内のサブ画面** (NavigationStack push) として置く (出席率を見る導線)。iOS-2 で 5 tab + カレンダーに拡張。
- 各 tab は `NavigationStack` を内包 (push 遷移用)。
- tab 構成は iOS-2 で `ルーム` `学期・科目` を足して再編する前提 (拡張余地を残す = 並列拡張)。

### 6.3 シート / 遷移 (iOS-1)

- 出席ステータス変更: `OccurrenceRow` タップ → `.confirmationDialog` or 小さい `.sheet` で 6 状態選択 (PRESENT/ABSENT/EXCUSED/TARDY/EARLY_LEAVE/CANCELLED)。
- SemesterOverview: Timetable tab から `NavigationLink` で push。

---

## 7. 段階ロードマップ

### Phase iOS-1 (詳細 — 承認後すぐ着手できる粒度)

**スコープ**: scaffold + DesignSystem + APIClient + 認証 (Bearer/Google/Apple) + 読み取り & 出席ループ。

実装順 (依存順):

1. **scaffold** (§1): Xcode プロジェクト生成、フォルダ構成、.gitignore、Info.plist (URL scheme `atender`, Sign in with Apple capability, Inter フォント登録)、Debug/Release xcconfig (baseURL, Google client id プレースホルダ)。
2. **DesignSystem** (§5): Theme / Color+Atender / Typography / Space / Radius / 共通 `StatusDot` `AtenderButton`。プレビューで dark/light 両方確認。
3. **Models** (§4): Phase iOS-1 型の Codable + Enums + ModelSync.md。`AtenderTests/Fixtures` に実 API JSON サンプルを置き `DTODecodingTests` で全型デコード検証。
4. **Networking** (§2.3): APIClient / APIEndpoint / APIError / APIConfig。`APIClientTests` で URLProtocol スタブを使い「Bearer 付与」「204」「401 ハンドリング」「error デコード」を検証。
5. **Auth** (§3): KeychainStore / AuthStore / AppleSignIn / GoogleSignIn。bootstrap → /api/me 検証。
   - 前提: §8 の API 先行実装 (bearer plugin / apple provider / trustedOrigins / Google 中継) が完了・デプロイ済であること。
6. **AuthView**: Google / Apple ボタン (web SignIn.tsx のトーン: "based in tokyo/chiba")。Magic Link は出さない (後回し)。
7. **TodayView** (出席ループの主役):
   - `GET /api/today` (date 省略=今日) → `OccurrenceDto[]` を startMinute 昇順表示。
   - 各コマ: 時限 / 時刻 / 科目名 / 教室 / 現在の status dot。
   - 「全部出席」ボタン → `POST /api/attendance/mark-all-present` body `{ date }`。
   - 各コマタップ → 6 状態選択 → `POST /api/attendance/:occurrenceId` body `{ status }`。楽観更新 + 失敗ロールバック。
   - 空時: `ContentUnavailableView` 「今日は授業がありません」。
   - 403 SETUP_REQUIRED → setup へ誘導。
8. **TimetableView** (週グリッド読み取り):
   - `GET /api/user-timetables` → 最新 (createdAt desc 先頭) を表示。または `me.user.defaultSemesterId` で絞り込み。
   - `daySlots` (時限) × `daysOfWeek` (曜日) のグリッドに `meetings` を配置。連続コマ (`periodCount > 1`) は縦結合 (knowledge `timetable-consecutive-cell-grid-row-span-coalesce` の方針を SwiftUI Grid/LazyVGrid で再現。Phase iOS-1 はまず単純配置で可、結合は余裕があれば)。
   - 読み取り専用 (CRUD は iOS-2)。
9. **SemesterOverviewView** (出席概要、Timetable tab から push):
   - `GET /api/semesters/:id/overview` (`me.defaultSemesterId`) → `overall.attendanceRate` + `courses[]` の科目別出席率リスト + `days[]` の簡易カレンダー (status 色)。
   - 表示専用。
10. **SettingsView** (最小): メール表示 / サインアウト (`AuthStore.signOut`) / テーマ切替 (system/dark/light を `@AppStorage` で保持し `.preferredColorScheme`)。

**Phase iOS-1 で作らないもの** (明示): CRUD 全般、カレンダー (月/週/日)、ルーム、友達、テンプレ、Google Calendar 連携、ICS 取込、プッシュ通知、オフラインキャッシュ、Magic Link、連続コマ結合の作り込み (簡易配置で可)。

### Phase iOS-2 (概要)

- **カレンダー** (月 / 週 / 日 view)。web の Home カレンダータブ相当。`GET /api/day/:date`, `GET /api/semesters/:id/overview` の days を月グリッドに。個人カレンダーは時間割をクライアント展開して実授業表示 (knowledge `personal-calendar-data-source-meeting-expansion`)。
- **科目 / 授業 CRUD**: 共通モーダル (web の MeetingEditModal / MeetingCreateSheet 相当)。`PATCH /api/user-timetables/:id`, courses/meetings 系。SwiftUI `.sheet` + Form。
- **休講**: course suspension / timetable suspension (`/api/timetable-suspensions`, course suspensions)。
- **個人イベント**: `/api/personal-events`。
- tab を 5 構成に再編 (ホーム/学期・科目/ルーム/友達/設定)。共通 Chip / BottomSheet コンポーネント拡充。

### Phase iOS-3 (概要)

- **ルーム** (`/api/rooms`, roomWeek, roomEvents) / **フレンド** (`/api/friends`, invite code, join)。
- **テンプレ** (search / copy / publish)。
- **Google Calendar 連携** (incremental scope: better-auth linkSocial。ネイティブでの追加 scope 取得フロー要設計) / **ICS 取込** (preview/commit 2-phase)。
- **設定フル** + **プッシュ通知** (APNs 登録、device token を API に保存する新エンドポイント要設計、Local + APNs hybrid)。
- shared Zod → Swift Codable **自動生成**の導入検討。Strict Concurrency Complete 化。

---

## 8. API 前提 (先行実装する分 — Leader が Xcode 待ちの間に実装・検証)

対象: `apps/api`, `packages/shared`。既存 Vitest + 実 SQLite でテスト可能な形で挙動仕様を明記する。

### 8.1 better-auth `bearer` plugin 追加

- **変更**: `apps/api/src/auth.ts` の `plugins` に `bearer()` を追加 (`import { bearer } from "better-auth/plugins"`)。`magicLink` と併存。
- **挙動仕様**:
  - 正常系: サインイン系レスポンス (`POST /api/auth/sign-in/social` 等) に `set-auth-token` ヘッダが付く。
  - 正常系: 任意の保護 API に `Authorization: Bearer <validToken>` を付けると `auth.api.getSession({ headers })` が当該 session/user を返す。
  - 正常系: Cookie 認証は従来通り動く (bearer 追加で web が壊れない)。
  - 異常系: 不正/期限切れ token を Bearer で送ると `getSession` が null → 既存 `sessionMiddleware` が 401 `{error:{code:"UNAUTHORIZED"}}`。
- **テスト (Vitest)**: 既存 better-auth test helper (cookie 形式は `gotcha/better-auth-test-cookie-must-match-hono-signed-format` 参照) に加え、`Authorization: Bearer <token>` ヘッダで `/api/me` が 200 を返すケース、不正 token で 401 を返すケースを追加。

> 注意: 既存 `sessionMiddleware` (§middleware/session.ts) は `auth.api.getSession({ headers })` を先に呼ぶので、bearer plugin が入れば Bearer ヘッダはこの経路で自動解決される。**middleware 自体の変更は原則不要**。ただし getSession が bearer を見るか要検証 (better-auth のバージョン挙動)。見ない場合のみ middleware に Bearer→token 抽出経路を追加 (Cookie 抽出と同じ要領)。この分岐は実装時に検証して確定する。

### 8.2 Apple social provider 追加

- **変更**: `apps/api/src/auth.ts` `socialProviders` に `apple` を追加:
  ```ts
  apple: {
    clientId: env.APPLE_CLIENT_ID,           // Service ID (web) / App Bundle ID
    clientSecret: env.APPLE_CLIENT_SECRET,    // 署名生成 or better-auth の appleClientSecret 生成
    // ネイティブ idToken 検証用に audience に App Bundle ID を許可
    appBundleIdentifier: env.APPLE_APP_BUNDLE_ID,  // "net.appily.atender"
  }
  ```
- **env 追加** (`apps/api/src/env.ts` の `EnvSchema`): `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET`, `APPLE_APP_BUNDLE_ID` を `z.string().min(1)` で追加。**ただしテスト環境では未設定でも他テストが落ちないよう** `.optional()` にするか、test env に dummy を入れる (既存 env パターンに合わせる。実装時に既存 .env.test を確認して整合)。
- **挙動仕様**:
  - 正常系: `POST /api/auth/sign-in/social` body `{ provider:"apple", idToken:{ token:"<validAppleIdToken>" } }` → User/Account upsert + session 発行 + `set-auth-token` ヘッダ。
  - 異常系: 不正 idToken → 401/400 エラー (better-auth 標準)。
- **テスト**: Apple idToken の検証は外部依存 (Apple 公開鍵) のため、Vitest では**「apple provider が auth 設定に登録されていること」「env schema が新キーを要求/許容すること」**の構成テストに留める。idToken 検証の E2E は実機 + TestFlight で確認 (テスト対象外と明記)。

### 8.3 trustedOrigins にネイティブ scheme 追加

- **変更**: `BETTER_AUTH_TRUSTED_ORIGINS` (env) に `atender://auth` (および必要なら `atender://`) を追加。`apps/api/src/env.ts` の `trustedOrigins` は CSV split なので env 値に追記するだけ。
- **挙動仕様**: `POST /api/auth/sign-in/social` の `callbackURL: "atender://auth"` が trustedOrigins に含まれ拒否されない。
- **テスト**: `trustedOrigins` 配列に `atender://auth` が含まれることを確認するユニットテスト (env パース結果の検証)。

### 8.4 Google ネイティブ用 token 中継 (確実な token 受け渡し)

ネイティブ Google web flow で、callback 完了後にトークンをアプリに渡す経路。

- **変更**: API に薄い中継ハンドラを追加。設計確定方式:
  - ネイティブは `POST /api/auth/sign-in/social` body `{ provider:"google", callbackURL:"atender://auth" }` で得た Google consent URL を ASWebAuthenticationSession で開く。
  - better-auth が Google callback (`/api/auth/callback/google`) を処理し session を確立、`callbackURL` (`atender://auth`) へ 302 redirect する。
  - **このとき token をネイティブに渡すため**、better-auth の redirect 先を中継する `GET /api/auth/native/callback` を新設し、session 確立済み (Set-Cookie or 直後 session) から token を取り出して `atender://auth#token=<sessionToken>` の fragment 付き redirect を返す。
  - 実装容易な代替: bearer plugin は `set-auth-token` を**サインインレスポンスヘッダ**に載せるが、Google は redirect なのでヘッダを ASWebAuthenticationSession から読めない。よって **中継ハンドラで session token を fragment に載せる**方式を採る。`callbackURL` をネイティブ用に `<API>/api/auth/native/callback?next=atender://auth` とし、ハンドラが session token を解決して `atender://auth#token=...` へ返す。
- **挙動仕様**:
  - 正常系: 有効な session 確立状態で `GET /api/auth/native/callback?next=atender://auth` を叩くと、`atender://auth#token=<token>` への 302 を返す。
  - 異常系: session 未確立で叩くと 401。`next` が trustedOrigins 外なら 400 (オープンリダイレクト防止)。
- **テスト (Vitest)**: session cookie を持たせて中継ハンドラを叩き、Location ヘッダが `atender://auth#token=<...>` 形式であること / token が DB session と一致すること / 未認証で 401 / 不正 next で 400 を検証。
- **設計判断**: この中継方式により Google も「fragment から token 抽出 → Keychain」で Apple と同じ最終処理に揃う。Google ネイティブ SDK 不要。

> ※ 実装時、better-auth のバージョンが `idToken` での Google ネイティブサインイン (`{ provider:"google", idToken:{token} }`) を安定サポートしているなら、中継方式より idToken 直渡しの方が単純。実装着手時に better-auth ドキュメントで Google idToken 経路の現存を確認し、使えるなら §8.4 中継を Apple と同形の idToken 経路に置換する (その場合 GoogleSignIn-iOS SDK が必要になるため SPM 依存ゼロ方針とのトレードオフ。Phase iOS-1 は中継方式を既定とし、idToken 経路は判断ポイントとして記録)。

### 8.5 (推奨・任意) `MeResponseDto` を shared に追加

- **変更**: `packages/shared/src/schemas/me.ts` に `MeResponseDto` (`user` + `setupStatus`) を Zod で追加し、me route がそれを返す形に整える。Swift ミラーの出典を明確化。
- **テスト**: `GET /api/me` のレスポンスが `MeResponseDto` で parse できることを検証。
- 任意 (なくても Swift 側は route から手起こし可能)。Phase iOS-1 着手の前にやれると Swift モデルが綺麗。

### 8.6 CORS

- 現状 `corsMiddleware` は `Origin === PUBLIC_WEB_URL` のみ許可。ネイティブは Origin ヘッダを送らない (URLSession) ため CORS の影響を受けない (CORS はブラウザのみ)。**変更不要**。ASWebAuthenticationSession の web flow も Origin 制約に当たらない。明示的に「ネイティブは CORS 対象外」と記録。

---

## 9. テスト方針

### 9.1 iOS (apps/ios)

- フレームワーク: **XCTest** (Phase iOS-1)。Swift Testing は魅力的だが iOS-1 は XCTest で確実に。`AtenderTests` ターゲット。
- ビルド検証: `xcodebuild -project apps/ios/Atender.xcodeproj -scheme Atender -destination 'platform=iOS Simulator,name=iPhone 16' build` / `test`。Xcode インストール後に CI 不要のローカル検証。
- テスト対象 (Reviewer が設計から書ける範囲):
  - **DTODecodingTests**: `Fixtures/*.json` (実 API レスポンスサンプル) を各 Codable 型でデコードし、フィールド値を assert。null/optional/enum 未知値フォールバックを網羅。
  - **APIClientTests**: `URLProtocol` スタブで HTTP を差し替え。「requiresAuth=true で Authorization ヘッダに Bearer が付く」「204 で成功」「401 で APIError.unauthorized + authStore.handleUnauthorized 呼び出し」「`{error:{code}}` を APIError.api にデコード」「ボディが Content-Type: application/json になる」。
  - **AuthStoreTests**: bootstrap (token あり→/api/me 200→signedIn / 401→signedOut / token なし→signedOut)、completeGoogleSignIn (`atender://auth#token=abc` を解析して Keychain 保存 + signedIn)、handleUnauthorized で signedOut。Keychain と APIClient はプロトコル化してモック。
  - **KeychainStoreTests**: save→load→delete の往復 (Simulator Keychain 使用、テスト後クリーンアップ)。
- ViewModel テスト: TodayViewModel の「楽観更新→失敗ロールバック」をモック APIClient で検証。
- UI snapshot / E2E は Phase iOS-1 では必須にしない (Reviewer はロジック層中心)。

### 9.2 API 前提分 (apps/api)

- 既存 **Vitest + 実 SQLite**。§8 各節の「テスト」項目に挙動仕様を明記済。Reviewer は §8 を根拠に TS テストを生成。
- 既存 gotcha 順守: test cookie は Hono signed cookie 形式 (`gotcha/better-auth-test-cookie-must-match-hono-signed-format`)、PrismaClient シングルトン pin 回避 (`gotcha/prisma-singleton-pinned-to-env-test-database-url`)、setup で migration (`gotcha/vitest-server-setup-must-migrate-app-db`)。
- Apple idToken 検証の E2E はテスト対象外 (実機/TestFlight)。構成テストのみ。

---

## 10. 不採用案

- **Capacitor / WebView ラップ**: 確定方針で不採用。JS 資産を使わずネイティブ品質を目指すため (本命案件、フル機能パリティ + ネイティブ UX)。既存 knowledge `web-first-capacitor-later-design` は別プロダクト (tomori) の戦略であり Atender iOS には適用しない。
- **React Native / Expo**: 同上。Swift ネイティブ確定。
- **`.xcworkspace` + CocoaPods**: SPM で足り、依存も最小なので不採用。CocoaPods はメンテ負債。
- **外部 HTTP ライブラリ (Alamofire)**: async URLSession で十分。依存削減。
- **外部 Keychain ライブラリ (KeychainAccess)**: Security API ラッパは薄い。自前 `KeychainStore` で十分。
- **JWT セッション化 (better-auth を JWT plugin に切替)**: 既存 DB session を維持したまま bearer plugin で token 化できるため、JWT 化は不要 (web を壊さない / セッション失効を DB で制御できる)。
- **GoogleSignIn-iOS SDK (ネイティブ Google)**: Phase iOS-1 は web flow + 中継で実現し SPM 依存ゼロを優先。better-auth が Google idToken 経路を安定提供するなら iOS-2 で再評価 (§8.4 注記)。
- **iOS 16 サポート**: Observation (@Observable) の boilerplate 削減効果を取るため iOS 17 最小。学生層シェアで許容。
- **オフライン永続キャッシュ (SwiftData) を Phase iOS-1 で導入**: 読み取り + 出席ループの検証が先。過剰な土台投資を避け iOS-2 以降に判断。
- **5 tab を iOS-1 で全部作る**: 出席ループ (本命の価値) に集中するため 3 tab に絞る。拡張余地は残す。
