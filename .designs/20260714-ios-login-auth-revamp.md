# iOS ログイン画面刷新 + 認証3系統 (Google 修正 / Apple 新規 / メール Magic Link 移植)

## 目的
TestFlight 実機で iOS 認証が全滅している。原因は (1) API `trustedOrigins` に `atender://auth` が無く Google の native/callback が 400、(2) iOS entitlements に Sign in with Apple が無く ASAuthorizationController が即 1000 失敗 + 本番 API に apple provider 未設定で 404、(3) iOS に Magic Link ログインが存在しない。この3系統を実機で通し、同時にログイン画面を Web 忠実移植のミニマル構成 (画像ロゴ + 誘導文 + 3ボタン) に刷新する。**iOS のみ Apple を追加、Web は一切触らない。**

## スコープ境界 (触るファイル)

**API (`apps/api`)**
- `src/env.ts` — Apple 用 env 追加、trustedOrigins コメント更新
- `src/auth.ts` — `buildAppleClientSecret()` 追加、`getAppleProviderConfig()` を動的 client secret 対応に
- `tests/setup.ts` — test 既定 `BETTER_AUTH_TRUSTED_ORIGINS` に `atender://auth` 追加

**iOS (`apps/ios`)**
- `Atender/Atender.entitlements` — `com.apple.developer.applesignin` 追加
- `Atender/Assets.xcassets/` — `logo-mark` / `wordmark` / `google-g` imageset 追加
- `Atender/Core/Auth/AuthStore.swift` — `startMagicLink` 追加、`completeGoogleSignIn` → `completeTokenSignIn` 改名、`isAuthCallback` 追加
- `Atender/Features/Auth/AuthView.swift` — 全面書き換え
- `Atender/Features/Auth/AuthViewModel.swift` — 新規 (状態機械)
- `Atender/Core/DesignSystem/Components/AuthProviderButton.swift` — 新規
- `Atender/App/RootView.swift` — `onOpenURL` に auth callback インターセプト追加
- `AtenderTests/AuthStoreTests.swift` — 改名反映 (Developer が既存参照を更新)

**触らない**: `apps/web/**` 全部。iOS の他タブ/画面。

---

## UI/UX

### 移植元との対応

| 要素 | Web 正典 (`SignIn.tsx` / `AuthLayout.tsx`) | iOS 移植後 |
|---|---|---|
| ロゴ | AuthLayout ヘッダに mark 24px + wordmark 19px (小) | **ログイン画面本体の上部に mark 56pt + wordmark 22pt (hero)** |
| 見出し | `PageTitle "Atender" / "Attendance for students"` | **削除** (ロゴが担う) → 代わりに誘導文 |
| 誘導文 | なし | **「下記のアカウントを使用してログイン」** (新規) |
| サブタイトル | なし (iOS 現状の "Based in Tokyo/Chiba…" は Web に無い) | **削除** |
| based in tokyo/chiba | Web は Panel 下に小さく表示 | **iOS では削除** |
| メール | email field + "ログインリンクを送る" primary | メールボタン → タップで展開 (progressive disclosure 1 段) |
| Google | "G　Google でサインイン" secondary | Google ボタン (白 + border + G ロゴ) |
| Apple | なし (Web 非対応) | **iOS 新規** Apple 純正ボタン (黒) |
| デザイントークン | `styles.css` (azure accent / light 既定) | iOS 既存トークン (`Color+Atender.swift` 等、値は 1:1 一致済) |

### 画面レイアウト (SwiftUI, center-aligned column)

```
┌──────────────────────────────┐
│                              │
│           [logo-mark 56pt]   │  ← 上部 (上から ~28% 位置)
│           [wordmark 22pt]    │
│                              │
│   下記のアカウントを使用してログイン │  ← 誘導文 atenderBase textSecondary
│                              │
│  ┌────────────────────────┐  │
│  │   Apple で続ける      │  │  ← 純正ボタン (黒), height 48, radius sm(10)
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │ [G]  Google で続ける  │  │  ← 白+border, height 48, radius sm(10)
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │ ✉  メールで続ける     │  │  ← accent (primary), height 48, radius sm(10)
│  └────────────────────────┘  │
│                              │
│  (メールタップ時のみ展開↓)      │
│  ┌────────────────────────┐  │
│  │ email TextField         │  │
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │  ログインリンクを送る    │  │
│  └────────────────────────┘  │
│  メールを送信しました…(sent時)   │
│                              │
└──────────────────────────────┘
```

- 全体は `VStack` を垂直中央寄せ (`.frame(maxHeight:.infinity)` + 上下 `Spacer`)。ロゴブロックは上寄り、ボタン群は画面中央〜下 (親指到達域, §2)。
- 水平 padding `Space.s6` (24)。背景 `Color.bgBase.ignoresSafeArea()` (既存 `AmbientBackground` は RootView が敷く)。
- ボタン間 gap `Space.s3` (12)。ロゴ〜誘導文〜ボタン群のセクション間 `Space.s6` (24)。

### 3ボタン統一デザイン (要望5)

**統一する軸 (全3ボタン共通)**: full-width / 高さ `Space.s12` (48pt, ≥44 tap target) / 角丸 `Radius.sm` (10) / leading アイコン + 中央ラベル / ラベル `atenderLg` (17) SemiBold。

**統一できない軸 (制約明記)**: Apple 純正 `SignInWithAppleButton` は Apple 指定フォント固定でありアプリ側フォントに変更不可。→ フォントは Apple ボタンのみ純正、Google/メールは Inter SemiBold。「統一感」は**同一ジオメトリ (高さ・角丸・幅・アイコン左/ラベル中央) と等間隔スタック**で担保する。App Store 審査 4.8/HIG 対策として Apple は純正ボタンを維持 (自前ボタンで Apple ロゴを描くと審査リスク)。

**各ボタンの塗り** (provider 慣習に従う。3塗りは §4「prominent 1-2」からの逸脱: 各 provider のブランド規定 + Web parity(メール=primary) が理由):

| ボタン | 実装 | 背景 | 前景 | 備考 |
|---|---|---|---|---|
| Apple | `SignInWithAppleButton(.continue)` `.signInWithAppleButtonStyle(.black)` `.frame(height:48)` `.clipShape(RoundedRectangle(cornerRadius:Radius.sm, style:.continuous))` | 黒 (純正) | 白 (純正) | light 既定テーマで黒が映える。dark では `.white` に切替可 (colorScheme 分岐、逸脱理由: 純正ボタンの視認性) |
| Google | `AuthProviderButton` | `Color.bgElevated` + `Color.borderDefault` 1px | `Color.textPrimary` | leading に `google-g` imageset (18pt) |
| メール | `AuthProviderButton` | `Color.accentGradient` | `Color.textOnAccent` | leading に SF Symbol `envelope.fill`。Web の primary(email) を踏襲 |

### 新規コンポーネント `AuthProviderButton`

```swift
struct AuthProviderButton: View {
    enum Fill { case accent, outline }   // accent=メール, outline=Google
    let title: String
    var leadingSystemImage: String? = nil   // SF Symbol (メール=envelope.fill)
    var leadingAssetName: String? = nil     // Assets imageset 名 (Google="google-g")
    var fill: Fill
    var isLoading: Bool = false
    var isEnabled: Bool = true
    let action: () -> Void
    // height 48 固定 / radius Radius.sm / font atenderLg semibold /
    // leading アイコン 18pt + Space.s2 gap + 中央 title /
    // isLoading 時 ProgressView(tint: 前景色) / isEnabled false は opacity 0.52 + 無効
}
```

### AuthViewModel (状態機械。Reviewer はここを VM 単体テスト)

```swift
@MainActor @Observable
final class AuthViewModel {
    enum EmailPhase: Equatable { case collapsed, editing, sent }

    // 依存はクロージャ注入 (protocol 化せず単体テスト可能に)
    init(
        sendMagicLink: @escaping (_ email: String) async throws -> Void,
        signInApple:   @escaping () async throws -> Void,
        signInGoogle:  @escaping () async throws -> Void,
        cooldownSeconds: Double = 60
    )

    var email: String = ""                        // 双方向 (TextField)
    private(set) var emailPhase: EmailPhase = .collapsed
    private(set) var isAppleLoading = false
    private(set) var isGoogleLoading = false
    private(set) var isSendingLink = false
    private(set) var cooldownActive = false
    private(set) var errorMessage: String? = nil

    var canSendLink: Bool { !email.isEmpty && !isSendingLink && !cooldownActive }

    func openEmail()                 // collapsed → editing
    func tapApple() async            // isAppleLoading 制御 + signInApple() 呼出 + 失敗で errorMessage
    func tapGoogle() async           // 同上 (signInGoogle)
    func sendLink() async            // canSendLink false なら no-op。isSendingLink→sendMagicLink→成功: emailPhase=.sent + cooldown 開始 / 失敗: errorMessage、cooldown 開始しない
    func dismissError()              // errorMessage=nil
}
```

- cooldown: `sendLink` 成功後 `cooldownActive=true`、`Task { try? await Task.sleep(for: .seconds(cooldownSeconds)); cooldownActive=false }`。
- 送信ボタンラベルは View 側で `emailPhase == .sent ? "再送する" : "ログインリンクを送る"` (Web parity)。
- `.sent` 表示文言: 「メールを送信しました。15 分以内にリンクを開いてください」(Web と同一、magicLink expiresIn=15分)。
- View は `environment.authStore` のメソッドをクロージャに束ねて VM に渡す (Apple の idToken 取得 / Google の ASWebAuthenticationSession 起動は View 側 helper が担い、結果を authStore に流す)。

### ロゴアセット追加手順 (Developer 実施)

Web の PNG を iOS の imageset 化する。元ファイル: `apps/web/public/logo-mark.png` (@1x), `apps/web/public/logo-mark@2x.png` (@2x), `apps/web/public/wordmark-navy.png` (light用), `apps/web/public/wordmark-white.png` (dark用)。

1. `Assets.xcassets/logo-mark.imageset/` を作成、`logo-mark.png`(1x) / `logo-mark@2x.png`(2x) をコピー。3x は空欄でよい (2x から補間)。`Contents.json`:
```json
{ "images":[
  {"filename":"logo-mark.png","idiom":"universal","scale":"1x"},
  {"filename":"logo-mark@2x.png","idiom":"universal","scale":"2x"},
  {"idiom":"universal","scale":"3x"}],
  "info":{"author":"xcode","version":1}}
```
2. `Assets.xcassets/wordmark.imageset/` を作成、**light/dark 自動切替**を appearances で持つ。`wordmark-navy.png`→ Any、`wordmark-white.png`→ Dark。`Contents.json`:
```json
{ "images":[
  {"filename":"wordmark-navy.png","idiom":"universal","scale":"1x"},
  {"idiom":"universal","scale":"2x"},
  {"idiom":"universal","scale":"3x"},
  {"appearances":[{"appearance":"luminosity","value":"dark"}],"filename":"wordmark-white.png","idiom":"universal","scale":"1x"},
  {"appearances":[{"appearance":"luminosity","value":"dark"}],"idiom":"universal","scale":"2x"},
  {"appearances":[{"appearance":"luminosity","value":"dark"}],"idiom":"universal","scale":"3x"}],
  "info":{"author":"xcode","version":1}}
```
   View 側は `Image("wordmark").resizable().scaledToFit().frame(height:22)` で light/dark 自動切替。
3. `Assets.xcassets/google-g.imageset/` を作成。Google の "G" ロゴ (18pt 相当の正方 PNG)。**元アセットが repo に無い場合は Developer が Google ブランドの公式 G ロゴ PNG を配置**するか、暫定で SF Symbol は使わず単色 "G" を描画するプレースホルダを置き、Touri に差し替え依頼 (承認ゲートで確認)。imageset Contents.json は logo-mark と同形式。
4. `logo-mark` は SwiftUI `Image("logo-mark").resizable().scaledToFit().frame(width:56,height:56)`。

### §7 UI/UX チェック観点の充足

1. **視覚階層**: L0=ロゴ (mark+wordmark, 上部に孤立) / L1=3ボタン (等価, 中央) / L2=誘導文 (textSecondary) / L3=sent/error メッセージ (atenderSm)。ボタンは全て同サイズ=対等な選択肢を明示。
2. **タスク頻度→動線**: ログインは 1 タスク。最頻 (Apple/Google) を上 2 つ、メールは 1 タップで展開 (progressive disclosure 1 段, §6)。
3. **token 参照先**: iOS 既存トークン (`Space`/`Radius`/`Color+Atender`/`Typography`)。数値ハードコード禁止。
4. **状態網羅**: 下記「挙動仕様」で empty(初期)/editing/sending/sent/cooldown/error/各 provider loading を規定。
5. **アクセシビリティ**: 全ボタン高さ 48≥44。誘導文/ラベルは textPrimary/Secondary でコントラスト AA。email TextField は `autocapitalization(.never)` `.keyboardType(.emailAddress)` `.textContentType(.emailAddress)`。
6. **dark 対応**: `wordmark` imageset で自動切替、Apple ボタンは colorScheme 分岐で `.black`/`.white`。手動トグルは作らない (RootView の themePreference は既存踏襲)。
7. **ナビ構造**: §5「毎回同じ1タスク」= 1画面 + progressive disclosure。タブ増設なし。
8. **数値逸脱**: ボタン高さ 48 (初期値 44 以上, 快適性で 48)。3塗り (§4 の prominent 1-2 から逸脱, 理由=provider ブランド規定 + Web parity)。以上を逸脱理由として記録。

---

## データ・型

### API env 追加 (`env.ts`)

`EnvSchema` に以下を追加 (全て `OptionalNonEmptyString`):

```ts
APPLE_TEAM_ID:     OptionalNonEmptyString,   // = "2J3HYGP2K8" (既知)
APPLE_KEY_ID:      OptionalNonEmptyString,   // Apple portal の Sign in with Apple Key の Key ID
APPLE_PRIVATE_KEY: OptionalNonEmptyString,   // .p8 の PEM 本文。改行は "\n" エスケープ可 (loader が復元)
```

既存 `APPLE_CLIENT_ID` / `APPLE_CLIENT_SECRET` / `APPLE_APP_BUNDLE_ID` は据え置き:
- `APPLE_CLIENT_ID` = Apple Service ID (例 `net.appily.atender.signin`)
- `APPLE_APP_BUNDLE_ID` = `net.appily.atender`
- `APPLE_CLIENT_SECRET` = **静的 client secret JWT の脱出口** (通常は未設定。設定時はそれを優先)

`BETTER_AUTH_TRUSTED_ORIGINS` (本番 Coolify env) に `atender://auth` を追加 (CSV 末尾。既存 web origin は保持)。

### iOS API DTO (AuthStore, 既存 + 追加)

```swift
// 追加
private struct MagicLinkBody: Encodable { let email: String; let callbackURL: String }
// 既存据え置き: AppleSignInBody{provider,idToken:{token}}, GoogleSignInBody{provider,callbackURL},
//               GoogleSignInResponse{url,redirect}
```

---

## API / 関数シグネチャ

### `auth.ts` — Apple client secret 動的生成

better-auth 1.6.11 の apple provider は native idToken (`POST /sign-in/social {provider:"apple", idToken:{token}}`) を受け付け、`appBundleIdentifier` を audience として検証する (project 既存の知見 [[pattern/better-auth-bearer-native-token-relay]] で確認済)。ただし provider config は `clientSecret` を必須とするため、Service ID を `sub` とする ES256 の client secret JWT を生成して config を成立させる。**生成は node:crypto で同期実装** (getAuth を async 化しないため。jose 等の追加依存なし)。

```ts
import { createPrivateKey, sign as cryptoSign } from "node:crypto";

// PEM 内の "\n" エスケープを実改行へ復元
export function normalizeApplePem(raw: string): string {
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

// ES256 の Apple client secret JWT を同期生成
// header: {alg:"ES256", kid: keyId, typ:"JWT"}
// payload: {iss: teamId, iat, exp, aud:"https://appleid.apple.com", sub: clientId}
export function buildAppleClientSecret(
  input: { teamId: string; keyId: string; privateKeyPem: string; clientId: string },
  now: Date = new Date(),
): string {
  const iat = Math.floor(now.getTime() / 1000);
  const exp = iat + 60 * 60 * 24 * 180;   // 180 日 (Apple 上限 6ヶ月 未満)
  const b64url = (b: Buffer) => b.toString("base64url");
  const header = b64url(Buffer.from(JSON.stringify({ alg: "ES256", kid: input.keyId, typ: "JWT" })));
  const payload = b64url(Buffer.from(JSON.stringify({
    iss: input.teamId, iat, exp, aud: "https://appleid.apple.com", sub: input.clientId,
  })));
  const signingInput = `${header}.${payload}`;
  const key = createPrivateKey(normalizeApplePem(input.privateKeyPem));
  // JWT は raw r||s (P1363) 署名。DER ではない
  const sig = cryptoSign("sha256", Buffer.from(signingInput), { key, dsaEncoding: "ieee-p1363" });
  return `${signingInput}.${b64url(sig)}`;
}

function getAppleProviderConfig():
  { clientId: string; clientSecret: string; appBundleIdentifier: string } | null {
  const { APPLE_CLIENT_ID, APPLE_APP_BUNDLE_ID, APPLE_CLIENT_SECRET,
          APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY } = env;
  if (!APPLE_CLIENT_ID || !APPLE_APP_BUNDLE_ID) return null;
  const clientSecret =
    APPLE_CLIENT_SECRET ??
    (APPLE_TEAM_ID && APPLE_KEY_ID && APPLE_PRIVATE_KEY
      ? buildAppleClientSecret({
          teamId: APPLE_TEAM_ID, keyId: APPLE_KEY_ID,
          privateKeyPem: APPLE_PRIVATE_KEY, clientId: APPLE_CLIENT_ID,
        })
      : null);
  if (!clientSecret) return null;
  return { clientId: APPLE_CLIENT_ID, clientSecret, appBundleIdentifier: APPLE_APP_BUNDLE_ID };
}
```

`getAuth()` 内 `socialProviders.apple` は `getAppleProviderConfig()` の戻りをそのまま渡す (現行の spread 条件を維持)。**apple provider config の形は変更しない** (clientId / clientSecret / appBundleIdentifier)。

### Magic Link エンドポイント (既存 better-auth、変更なし)

- 送信: `POST /api/auth/sign-in/magic-link` body `{ email, callbackURL }` → 200。better-auth が Resend でメール送信。
- 検証: `GET /api/auth/magic-link/verify?token=…&callbackURL=…` → session cookie 発行 + 302 `callbackURL`。
- **iOS が渡す callbackURL** = `https://atender-api.appily.run/api/auth/native/callback?next=atender://auth` (Google と同じ native/callback 中継)。callbackURL の origin は baseURL と同一 (自動 trusted)。
- native/callback (`routes/auth.ts`, 変更なし) は cookie から session を解決し `atender://auth#token=<sessionToken>` へ 302。**この経路が成立する前提が `atender://auth` ∈ trustedOrigins** (現状欠落=バグ1/バグ3の共通根)。

### iOS `AuthStore` 変更

```swift
// 改名 (Google 専用名 → provider 非依存。Google と Magic Link 両方が使う)
//   completeGoogleSignIn(callbackURL:) → completeTokenSignIn(callbackURL:)
//   ※ body は現行そのまま (scheme 検証 + fragment token 抽出 + Keychain 保存 + state=.signedIn)
func completeTokenSignIn(callbackURL: URL) throws

// 追加: この URL が auth token コールバックか判定 (RootView.onOpenURL が deep link 判定前に呼ぶ)
func isAuthCallback(_ url: URL) -> Bool {
    url.scheme == APIConfig.authCallbackScheme && url.host == "auth"
}

// 追加: Magic Link 送信
func startMagicLink(email: String) async throws {
    let body = MagicLinkBody(email: email, callbackURL: nativeCallbackURL().absoluteString)
    let (data, response) = try await authRequestWithData(path: "/api/auth/sign-in/magic-link", body: body)
    guard (200...299).contains(response.statusCode) else {
        throw decodeHTTPError(data: data, status: response.statusCode)
    }
}
```

- `signInWithApple(idToken:)` / `startGoogleSignIn()` は据え置き。`nativeCallbackURL()` (既存) を Magic Link も再利用。
- 既存 `completeGoogleSignIn` の全参照 (`AuthView.swift`, `AuthStoreTests.swift`) を Developer が `completeTokenSignIn` に更新。

### iOS `RootView.onOpenURL` 変更

```swift
.onOpenURL { url in
    if environment.authStore.isAuthCallback(url) {
        Task {
            try? environment.authStore.completeTokenSignIn(callbackURL: url)
            await environment.authStore.refreshMe()   // me 取得 → state=.signedIn 確定
        }
        return
    }
    environment.appRouter.handleDeepLink(url, canNavigate: canNavigate)
}
```

- Google は ASWebAuthenticationSession のコールバック closure で `completeTokenSignIn` を直接呼ぶ (onOpenURL は経由しない) — 現行踏襲。
- Magic Link は Safari → `atender://auth#token=…` → onOpenURL 経由で上記インターセプトに入る。**deep link 判定 (`DeepLink.parse`) より前にインターセプト**すること (token を落とさない)。

---

## 挙動仕様 (Reviewer テスト生成の根拠)

### A. API: Apple provider 有効化

- **A1** `APPLE_CLIENT_ID` と `APPLE_APP_BUNDLE_ID` が両方セット、かつ (`APPLE_CLIENT_SECRET` 直値 or `APPLE_TEAM_ID`+`APPLE_KEY_ID`+`APPLE_PRIVATE_KEY` 全部) のとき、`getAppleProviderConfig()` は非 null を返す。
- **A2** `APPLE_CLIENT_ID` が未設定のとき null。
- **A3** `APPLE_APP_BUNDLE_ID` が未設定のとき null。
- **A4** clientId/bundleId はあるが secret 材料 (静的も動的3点も) が無いとき null。
- **A5** `APPLE_CLIENT_SECRET` (静的) がセットされていれば、動的3点の有無に関係なくそれが `clientSecret` になる (静的優先)。
- **A6** provider が null のとき、`POST /api/auth/sign-in/social {provider:"apple",…}` は apple provider 不在で 4xx (現状 404 相当)。非 null のとき apple ルートが存在する (5xx にならない)。

### B. API: `buildAppleClientSecret`

- **B1** 戻り値は `header.payload.signature` の3セグメント JWT (base64url、`.` 区切り)。
- **B2** header をデコードすると `{alg:"ES256", kid:<keyId>, typ:"JWT"}`。
- **B3** payload をデコードすると `iss=<teamId>`, `sub=<clientId>`, `aud="https://appleid.apple.com"`, `exp === iat + 60*60*24*180`, `iat === floor(now/1000)` (now 注入で決定的)。
- **B4** signature セグメントは base64url でデコードすると 64 byte (P-256 raw r||s。DER の可変長でない)。
- **B5** `normalizeApplePem`: `"\n"` エスケープを含む文字列は実改行に復元、含まなければそのまま。復元後の PEM で `createPrivateKey` が例外を投げない (正しい P-256 .p8 前提)。

### C. API: native/callback + trustedOrigins (バグ1/バグ3 根治)

- **C1** `trustedOrigins` に `atender://auth` が含まれる (test 既定 + 本番 env)。
- **C2** 有効 session cookie 付きで `GET /api/auth/native/callback?next=atender://auth` → 302、`Location` が `atender://auth#token=<t>`、`<t>` は DB session.token と一致。
- **C3** session 無しで同 → 401。
- **C4** `next=https://evil.com` (trustedOrigins 外) → 400 VALIDATION_ERROR。
- **C5** `next` 省略時は既定 `atender://auth` にフォールバックし、trustedOrigins に含まれるため 400 にならない (session 有無で 302/401)。
  ※ 既存 `tests/ios-api.test.ts` の §8.4 系がベースラインとして存在。C1 の test 既定変更で期待が変わる箇所は Reviewer が本仕様に沿って再整合させる (known-failures 台帳へ分類記録)。

### D. API: Magic Link (既存挙動の維持 + iOS callbackURL)

- **D1** `POST /api/auth/sign-in/magic-link {email, callbackURL:"…/api/auth/native/callback?next=atender://auth"}` → 200、Resend send が1回呼ばれる (mock)。
- **D2** callbackURL の origin は baseURL 同一なので trustedOrigins 検証を通過する (400 にならない)。
- **D3** `GET /api/auth/magic-link/verify?token=<invalid>` → 既存挙動 (無効/期限切れはエラー、既存 auth.test.ts の期待を壊さない)。

### E. iOS AuthStore

- **E1** `completeTokenSignIn`: `atender://auth#token=abc` → Keychain 保存 + `state == .signedIn` + `token == "abc"`。
- **E2** `completeTokenSignIn`: fragment に token 無し (`atender://auth`) → throw、`state` は `.signedIn` にならない。
- **E3** `completeTokenSignIn`: scheme が `atender` 以外 → throw (INVALID_CALLBACK)。
- **E4** `isAuthCallback`: `atender://auth` → true。`atender://rooms/join/x` → false。`https://…` → false。
- **E5** `startMagicLink`: 200 応答で正常終了 (throw しない)、送信 body の `callbackURL` が `…/api/auth/native/callback?next=atender://auth` を含む。
- **E6** `startMagicLink`: 4xx/5xx 応答で `APIError` を throw。
- **E7** `signInWithApple(idToken:)`: 200 かつ `set-auth-token` ヘッダあり → Keychain 保存 + `.signedIn`。ヘッダ欠落 → `APIError.api(code:"TOKEN_MISSING")` を throw (既存挙動維持)。

### F. iOS AuthViewModel

- **F1** 初期: `emailPhase == .collapsed`、全 loading false、`errorMessage == nil`。
- **F2** `openEmail()` → `emailPhase == .editing`。
- **F3** `canSendLink`: email 空 → false。email 有 & 非送信中 & 非cooldown → true。cooldownActive → false。isSendingLink → false。
- **F4** `sendLink()` 成功 (sendMagicLink が正常 return) → `emailPhase == .sent`、`cooldownActive == true`、`errorMessage == nil`。cooldownSeconds 経過後 `cooldownActive == false` (テストは cooldownSeconds=小値注入)。
- **F5** `sendLink()` 失敗 (sendMagicLink throw) → `errorMessage != nil`、`emailPhase` は `.sent` にならない、`cooldownActive == false`。
- **F6** `sendLink()` を `canSendLink==false` で呼ぶと sendMagicLink は呼ばれない (no-op)。
- **F7** `tapApple()` 成功 → 実行中 `isAppleLoading==true`、完了後 false、errorMessage nil。失敗 → `isAppleLoading==false` かつ `errorMessage != nil`。
- **F8** `tapGoogle()` も F7 と同型。
- **F9** `dismissError()` → `errorMessage == nil`。

### G. iOS 統合 (実機/E2E 送り — Vitest/XCTest では不能)

- **G1** TestFlight 実機で Apple ボタン → Face ID/Apple ID → `.signedIn`。
- **G2** 実機で Google ボタン → ASWebAuthenticationSession → `atender://auth#token` → `.signedIn`。
- **G3** 実機でメール → リンク受信 → タップ → Safari → アプリ復帰 → `.signedIn`。
- G1–G3 は Apple JWKS / Google OAuth / Resend 実送信に依存するため単体テスト対象外。設計承認後の TestFlight 検証チェックリストに載せる。

---

## テスト基盤

- **API**: Vitest 2 (`apps/api/tests/*.test.ts`, `vitest.config.ts`, `tests/setup.ts`)。既存パターン踏襲 (`app.request(...)`, `helpers/db`, Resend は `global.__resendSendMock`)。追加先:
  - `tests/auth-apple.test.ts` (新規想定) — A/B 系 (`getAppleProviderConfig` は env を差し替えて `resetAuth()` 後に検証 / `buildAppleClientSecret` は純関数として now 注入)。
  - `tests/ios-api.test.ts` (既存) — C 系を本仕様に再整合。
  - `tests/auth.test.ts` (既存) — D 系。
  - env 差し替えは `process.env.APPLE_*` を set → `resetAuth()` → `getAuth()`。テスト用 .p8 は P-256 の擬似鍵を `tests/helpers` に用意 (実 Apple 鍵は使わない)。
- **iOS**: XCTest (`apps/ios/AtenderTests/`)。`xcodebuild test -scheme Atender`。追加先:
  - `AuthStoreTests.swift` (既存) — E 系。改名反映。URLProtocol mock で `set-auth-token`/status 制御 (既存手法)。
  - `AuthViewModelTests.swift` (新規想定) — F 系。VM にスタブ closure 注入 (成功/throw)、cooldownSeconds=0.05 等。
- **ベースライン**: `apps/api` 全 Vitest GREEN、iOS 157 test GREEN 基準 (CLAUDE.md)。C1 の test 既定 trustedOrigins 変更で既存 §8.4 の期待が動く場合は `.knowledge/known-failures.md` に分類記録してから解消 (未分類残しでのマージ不可)。

---

## 外部設定 (Touri が portal で作業。発行物 → 投入先 env キー)

### 1. Apple Developer Portal (Sign in with Apple 3点セット)

Team ID = `2J3HYGP2K8` (既知)。以下を作成:

| 作業 | 場所 | 成果物 | 投入先 |
|---|---|---|---|
| App ID `net.appily.atender` に **Sign in with Apple** capability を有効化 | Certificates, IDs & Profiles → Identifiers → App IDs | (capability ON) | — (entitlements と対応) |
| **Service ID** を新規作成 (例 `net.appily.atender.signin`)。"Sign in with Apple" を有効化し、Primary App ID に上記 App ID を紐付け。Web Auth の Return URLs に `https://atender-api.appily.run/api/auth/callback/apple` を登録 | Identifiers → Services IDs | Service ID 文字列 | `APPLE_CLIENT_ID` |
| **Sign in with Apple Key** を作成し .p8 をダウンロード (**1回のみDL可**)。Key ID を控える | Keys → 新規, Sign in with Apple を選択 | `.p8` ファイル本文 / Key ID | `APPLE_PRIVATE_KEY` / `APPLE_KEY_ID` |
| Team ID | Membership | `2J3HYGP2K8` | `APPLE_TEAM_ID` |
| Bundle ID | (既知) | `net.appily.atender` | `APPLE_APP_BUNDLE_ID` |

- `APPLE_PRIVATE_KEY` は .p8 の PEM 本文 (`-----BEGIN PRIVATE KEY-----` 〜 `-----END PRIVATE KEY-----`)。Coolify env に1行で入れるため改行を `\n` にエスケープして投入 (loader が復元)。
- `APPLE_CLIENT_SECRET` は **通常空欄** (動的生成を使う)。

### 2. Google Cloud Console (バグ1 の 403 主因: 外部確認)

- OAuth 同意画面が **Testing** の場合、Testing users に実機ログインするアカウントを追加する (未登録だと `access_denied`/403)。
- または同意画面を **In production** に公開 (審査要否は scope 次第。現状 scope が基本情報のみなら審査不要で公開可)。
- 承認済リダイレクト URI に `https://atender-api.appily.run/api/auth/callback/google` が入っているか確認 (better-auth の Google callback)。
- 投入先 env は既存 `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (変更不要)。

### 3. Coolify (atender-api) env 投入

- `BETTER_AUTH_TRUSTED_ORIGINS` に `atender://auth` を CSV 追加 (既存値保持)。**バグ1/バグ3 の API 側根治はこれ**。
- `APPLE_CLIENT_ID` / `APPLE_APP_BUNDLE_ID` / `APPLE_TEAM_ID` / `APPLE_KEY_ID` / `APPLE_PRIVATE_KEY` を投入。
- 投入後 atender-api を再デプロイ (uuid `tq2lgr4eh6t80r3tkqjbpu7o`)。

### 4. iOS entitlements (Developer 実施だが署名は Touri の Team 依存)

- `Atender.entitlements` に追加 (associated-domains は保持):
```xml
<key>com.apple.developer.applesignin</key>
<array><string>Default</string></array>
```
- `xcodegen generate` → 再ビルド。TestFlight 配布時、App ID の capability (外部設定1) が有効なら automatic signing で provisioning profile に applesignin が載る。

---

## 不採用案

- **Magic Link を Universal Link (`applinks:atender.appily.run`) で直接アプリに戻す**: associated-domains は web ドメイン (`atender.appily.run`) だが、メールリンクは api ドメイン (`atender-api.appily.run`) の verify を叩くため Universal Link が発火しない。api ドメインに AASA を置く追加構成が要る。custom scheme `atender://auth` の native/callback 中継は Google と完全に同経路で再利用でき最小コスト。→ custom scheme 採用。
- **Apple client secret を静的 JWT で手動投入 (`APPLE_CLIENT_SECRET`)**: Apple の client secret は最長6ヶ月で失効し、忘れると Apple ログインが突然死する運用地雷。動的生成 (boot 時に180日 JWT を都度生成) で失効管理が消える。静的は脱出口として残すのみ。→ 動的生成を primary 採用。
- **client secret 生成に jose を追加依存**: `getAuth()` を async 化する必要が出る (jose の SignJWT は async) が、`auth` は同期 Proxy で全 route から呼ばれ影響が広い。node:crypto の `sign(…, {dsaEncoding:"ieee-p1363"})` で ES256 を同期生成でき、依存追加ゼロ・async 化ゼロ。→ node:crypto 同期実装採用。
- **Google をネイティブ SDK (GoogleSignIn-iOS) に置換**: 既存の ASWebAuthenticationSession + native/callback 中継が trustedOrigins 修正だけで通る。SDK 追加は依存増 + Web と別経路になり保守が割れる。→ 現行方式維持 (env 修正のみ)。
- **Apple ボタンも自前描画で font 統一**: Apple ロゴを自前ボタンに描くと審査 4.8/HIG 違反リスク。純正ボタンを維持し、統一はジオメトリ (高さ/角丸/幅) で担保。→ 純正ボタン + 幾何統一。
- **メールを常時表示フィールドにする (Web と同一)**: iOS の要望はミニマル (ロゴ+誘導文+3ボタン)。メールを3ボタンの1つにし progressive disclosure で展開する方が要望4に忠実。→ 展開式採用 (Web からの必然的変換)。
