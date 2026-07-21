# iOS アプリ内 QR 招待 (友達追加 / ルーム招待・参加)

## 目的

Instagram・LINE のように、友達追加とルーム招待/参加を **アプリ内 QR** で行えるようにする。招待する側は既存の招待 URL を QR として画面に出し、参加する側はカメラで読み取って既存の join/add フローに乗る。**backend 変更ゼロ・client のみ**（researcher 確定、`Muraki/knowledge/library/ios-qr-generate-scan.md`）。QR にエンコードするのは**既存の https 招待 URL そのまま**で、新形式は作らない。スキャン結果は既存の `AppRouter.handleDeepLink(_:)` に渡すだけで既存の join/add に接続する。

---

## スコープ境界（触るファイル）

**新規追加**（`Atender/` 配下は project.yml の `sources: [Atender]` で再帰的に自動ビルド対象。project.yml のソース追記は不要）:

| ファイル | 種別 | 役割 |
|---|---|---|
| `Atender/Core/QR/InviteURL.swift` | 純粋 | 招待 URL 文字列の一元生成（現状インライン重複の解消） |
| `Atender/Core/QR/QRCodeGenerator.swift` | 純粋 | 文字列 → `UIImage`（CoreImage） |
| `Atender/Core/QR/QRScanResult.swift` | 純粋 | スキャン payload → 有効な `URL?`（DeepLink 検証込み） |
| `Atender/Core/QR/QRScannerStateLogic.swift` | 純粋 | (isSupported, 権限) → 画面状態 enum |
| `Atender/Core/QR/CameraPermission.swift` | 薄 wrapper | カメラ権限の取得/照会 |
| `Atender/Core/DesignSystem/Components/InviteQRView.swift` | SwiftUI | QR 表示カード（DESIGN.md 準拠） |
| `Atender/Features/QR/DataScannerView.swift` | UIKit ラッパ | `DataScannerViewController` を `UIViewControllerRepresentable` で包む |
| `Atender/Features/QR/QRScannerScreen.swift` | SwiftUI | スキャナ画面（権限/未対応/スキャン中/無効フィードバック） |

**既存編集**:

| ファイル:行 | 編集内容 |
|---|---|
| `apps/ios/project.yml` (info.properties, 45行付近) | `NSCameraUsageDescription` を追加 |
| `Atender/Features/Rooms/RoomSheets.swift:163` (`inviteSection`) | QR 表示（`InviteQRView`）+ `ShareLink` を招待セクションに追加 |
| `Atender/Features/Rooms/RoomsView.swift:230` (`JoinByCodeSheet`) | 「QR コードで参加」ボタン + `fullScreenCover` でスキャナ |
| `Atender/Features/Friends/FriendsView.swift:234` (`inviteLinkSection`) | QR 表示 + `ShareLink` を追加 |
| `Atender/Features/Friends/FriendsView.swift:177` (`AddFriendSheet`) | 「QR コードで追加」ボタン + `fullScreenCover` でスキャナ |

既存の URL 生成インライン（`RoomSheets.swift:164` / `FriendsView.swift:235`）は `InviteURL` 呼び出しに置換する（重複除去 + テスト seam 化）。既存の「リンクをコピー」「再発行」「招待リンクで追加」入力は**残す**（QR は追加であって置換ではない）。

---

## UI/UX

DESIGN.md（視覚言語の正典）に準拠。トークンは既存（`Radius` / `Space` / `Color` / `atender*` フォント）を使い、新規トークンは作らない。標準部品（`ShareLink` / `ContentUnavailableView` / `.fullScreenCover`）を自前再発明しない（CLAUDE.md 規約）。

### A. QR 表示（招待する側）

`RoomSettingsSheet.inviteSection`（ルーム招待）と `AddFriendSheet.inviteLinkSection`（友達追加）に、共通コンポーネント `InviteQRView(urlString:)` を差し込む。

```
┌─ 招待リンク ────────────────────────┐   ← 既存の見出し (.atenderSm semibold / textSecondary)
│                                     │
│        ┌───────────────┐            │
│        │ ███ ▄▄ █ ██ ██ │            │   ← InviteQRView:
│        │ █ ▄▄▄▄▄  ▄ ▄██ │            │     白カード (Color.white 固定) / cornerRadius Radius.md(18)
│        │ ██  ██ ▄▄▄ █ █ │            │     QR 200x200pt / .interpolation(.none) で常時くっきり
│        │ ██ ▄ ███  ██ █ │            │     quiet zone = 内側 padding Space.s4(16)
│        └───────────────┘            │     .atenderShadow(.card)、中央寄せ
│                                     │
│ https://atender.appily.run/rooms/…  │   ← 既存の URL テキスト (.atenderXs / textTertiary)
│ [ リンクをコピー ] [ 共有 ] [ 再発行 ]  │   ← 既存 + ShareLink(item: URL) を「共有」として追加
└─────────────────────────────────────┘
```

- **QR の白背景は dark mode でも `Color.white` 固定**（黒モジュール on 白でないと読み取れない）。カードだけは semantic color に明け渡さない例外。DESIGN.md §3.3 の「浮く面は影を持つ」に従い `.atenderShadow(.card)`。
- **共有ボタン** = `ShareLink(item: URL(string: urlString)!)`（システム share sheet）。共有対象は **URL**（受け手はタップで universal link/deeplink に乗れる）。QR 画像共有は不採用（§不採用案）。`AtenderButton` の隣に `ShareLink` を `.buttonStyle` で体裁を合わせるのでなく、`ShareLink { AtenderButton(title:"共有", variant:.secondary, size:.sm){} }` の形は使わず、`ShareLink("共有", item:)` を `.font(.atenderSm)` で置く（ラベル付き標準 ShareLink）。
- inviteCode が空（ロード中 = `room?.inviteCode` が nil）の間は、`InviteQRView` は `.redacted(reason:.placeholder)` のスケルトン枠を出す（QR は描かない）。

### B. QR スキャン（参加/追加する側）

導線は既存の join/add フロー内に置く（ブリーフ指定）:

- **ルーム**: `JoinByCodeSheet`（「リンクで参加」シート、RoomsView から `.sheet` 表示）の content 先頭に `AtenderButton(title:"QR コードで参加", systemImage:"qrcode.viewfinder", variant:.secondary)`。既存の「招待リンクまたはコード」入力の**上**に置く。
- **友達**: `AddFriendSheet`（「友達を追加」シート）の `inviteLinkSection` の**下**に `AtenderButton(title:"QR コードで追加", systemImage:"qrcode.viewfinder", variant:.secondary)`。

ボタン押下で `QRScannerScreen` を `.fullScreenCover` で開く。スキャナ画面:

```
┌─────────────────────────────────────┐
│ [✕]                                 │  ← 閉じる (右上 or 左上、半透明円ボタン)
│                                     │
│         (ライブカメラプレビュー)       │  ← DataScannerView (VisionKit)
│         ┌───────────┐               │     枠内ハイライトは VisionKit 標準
│         │           │               │
│         │  QR 検出枠  │               │
│         │           │               │
│         └───────────┘               │
│                                     │
│   QR コードを枠内に収めてください        │  ← 案内テキスト (.atenderSm / white / 下部)
└─────────────────────────────────────┘
```

状態別（`QRScannerStateLogic.resolve` の結果で分岐）:

- **`.scanning`**（対応端末 + 権限あり）: 上図のカメラプレビュー。
- **`.checkingPermission`**（`.notDetermined`）: `ProgressView`。`.task` で `CameraPermission.request()` を呼び、結果で再解決。
- **`.permissionDenied`**（`.denied`/`.restricted`）: `ContentUnavailableView`（icon `Image(systemName:"camera.fill")`）＋ description「カメラへのアクセスが必要です」＋ actions に `Button("設定を開く")`（`UIApplication.shared.open(URL(string: UIApplication.openSettingsURLString)!)`）と `Button("閉じる")`。
- **`.unsupported`**（`DataScannerViewController.isSupported == false` = **シミュレータ / 非対応端末**）: `ContentUnavailableView`（icon `"qrcode.viewfinder"`）＋「この端末では QR スキャンを利用できません」＋「招待リンクまたはコードで参加してください」＋ `Button("閉じる")`。
- **無効 QR フィードバック**: スキャンした payload が atender の招待 URL でないとき、画面下部に一時オーバーレイ「無効な QR コードです」を約 2 秒表示（`@State invalidFlash` + `Task.sleep`）。スキャンは継続（`handled` を立てない）。toastCenter は使わない（`ToastOverlay` は `fullScreenCover` の下に隠れるため）。

### スキャン成功時の遷移（既存フロー再利用）

`QRScannerScreen` の `onResult(url)` を、開いた側のシートで次のように処理する（router は `@Environment(AppRouter.self)` で取得、両シートに注入する。`AppRouter` は `MainTabView` に注入済で sheet が継承する。`RoomSettingsSheet` が既に同 API を使っている実績あり）:

```swift
// JoinByCodeSheet / AddFriendSheet 内
@Environment(AppRouter.self) private var router
@State private var scannerPresented = false
...
.fullScreenCover(isPresented: $scannerPresented) {
    QRScannerScreen(
        onResult: { url in
            scannerPresented = false     // スキャナを閉じる
            isPresented = false          // 呼び出し元シート (join/add) を閉じる
            router.handleDeepLink(url)   // 既存: tab 切替 + NavigationStack へ push
        },
        onCancel: { scannerPresented = false }
    )
}
```

`router.handleDeepLink(url)` が `DeepLink.parse` → `.roomJoin`/`.friendAdd` に振り分け、`selectedTab` 変更 + 該当 `NavigationStack` に route を push する（`AppRouter.swift:25-49` 既存）。→ `JoinRoomView`（`RoomsView.swift:266`）/ `AddFriendByInviteCodeView`（`FriendsView.swift:259`）が `.task` で join/add API を呼ぶ。**join/add ロジックは一切再実装しない。** 友達シートからルーム QR を読んでも `handleDeepLink` が `selectedTab=.rooms` にするので正しくルーム参加に流れる（クロス遷移も既存 router 任せ）。

---

## データモデル / 型

**新規スキーマ・DTO・API 追加なし。** QR にエンコードする文字列は既存の招待 URL のみ:

- ルーム招待/参加: `https://atender.appily.run/rooms/join/<inviteCode>`
- 友達追加: `https://atender.appily.run/friends/add/<inviteCode>`

新規の純粋型 enum:

```swift
enum QRScannerViewState: Equatable {
    case checkingPermission
    case scanning
    case permissionDenied
    case unsupported
}
```

---

## API / 関数シグネチャ

型付き言語なので init・引数名・型・戻り値・isolation まで確定させる（Developer が即興しないため）。

### `InviteURL`（純粋・nonisolated）

```swift
enum InviteURL {
    /// "https://atender.appily.run/rooms/join/<inviteCode>"
    static func room(inviteCode: String) -> String
    /// "https://atender.appily.run/friends/add/<inviteCode>"
    static func friend(inviteCode: String) -> String
}
```

実装は文字列補間のみ（ホストは `"https://atender.appily.run"` を private const で保持）。`RoomSheets.swift:164` と `FriendsView.swift:235` のインライン文字列をこの呼び出しに置換する。

### `QRCodeGenerator`（純粋・nonisolated）

```swift
import CoreImage
import CoreImage.CIFilterBuiltins
import UIKit

enum QRCodeGenerator {
    /// 空文字列 or 生成失敗時は nil。成功時は正方形の UIImage (CIFilter 生の解像度、拡大は表示側で .interpolation(.none))。
    static func image(from string: String) -> UIImage?
}
```

実装（compile-verified スニペット準拠、`ios-qr-generate-scan.md`）:
- `guard !string.isEmpty else { return nil }`
- `let f = CIFilter.qrCodeGenerator(); f.message = Data(string.utf8); f.correctionLevel = "M"`
- `guard let out = f.outputImage, let cg = CIContext().createCGImage(out, from: out.extent) else { return nil }`
- `return UIImage(cgImage: cg)`
- 拡大は行わない（表示側 `Image(...).interpolation(.none).resizable().scaledToFit()` でくっきり拡大する）。

### `QRScanResult`（純粋・nonisolated）

```swift
enum QRScanResult {
    /// payload が atender の招待 URL のときだけ URL を返す。それ以外（非 URL / 他ドメイン / 未知パス / 空）は nil。
    static func deepLink(from payload: String) -> URL?
}
```

実装: `guard let url = URL(string: payload), DeepLink.parse(url) != nil else { return nil }; return url`。DeepLink 検証を必ず通すことで「無効 QR」判定を一元化する。

### `CameraPermission`（薄 wrapper）

```swift
import AVFoundation

enum CameraPermission {
    static var status: AVAuthorizationStatus { AVCaptureDevice.authorizationStatus(for: .video) }
    /// .notDetermined のときシステムダイアログを出す。戻り値 = 許可されたか。
    static func request() async -> Bool { await AVCaptureDevice.requestAccess(for: .video) }
}
```

### `QRScannerStateLogic`（純粋・nonisolated）

```swift
enum QRScannerStateLogic {
    static func resolve(isSupported: Bool, permission: AVAuthorizationStatus) -> QRScannerViewState
}
```

規則（順序が意味を持つ。unsupported が最優先）:
1. `!isSupported` → `.unsupported`
2. `permission == .authorized` → `.scanning`
3. `permission == .denied || permission == .restricted` → `.permissionDenied`
4. それ以外（`.notDetermined`）→ `.checkingPermission`

### `DataScannerView`（`UIViewControllerRepresentable`・@MainActor）

```swift
import SwiftUI
import VisionKit

struct DataScannerView: UIViewControllerRepresentable {
    let onScan: (String) -> Void   // RecognizedItem.barcode.payloadStringValue
    func makeUIViewController(context: Context) -> DataScannerViewController
    func updateUIViewController(_ uiViewController: DataScannerViewController, context: Context)
    func makeCoordinator() -> Coordinator
    final class Coordinator: NSObject, DataScannerViewControllerDelegate { ... }
}
```

- init 設定: `recognizedDataTypes: [.barcode(symbologies: [.qr])]`, `qualityLevel: .balanced`, `recognizesMultipleItems: false`, `isHighFrameRateTrackingEnabled: false`, `isGuidanceEnabled: true`, `isHighlightingEnabled: true`。
- `makeUIViewController` の最後で `try? vc.startScanning()`。
- delegate `dataScanner(_:didAdd:allItems:)`: `addedItems` から最初の `case .barcode(let b)` を取り、`b.payloadStringValue` があれば `onScan(payload)` を呼ぶ。
- **重複発火の停止は `DataScannerView` では行わず、`QRScannerScreen` 側の `handled` フラグで制御**（無効 QR のときは継続スキャンさせたいため、ラッパは stop しない）。

### `QRScannerScreen`（SwiftUI View・@MainActor）

```swift
struct QRScannerScreen: View {
    let onResult: (URL) -> Void
    let onCancel: () -> Void
    // @State: viewState (QRScannerViewState = .checkingPermission), handled (Bool=false), invalidFlash (Bool=false)
}
```

挙動:
- `.task`: `viewState = QRScannerStateLogic.resolve(isSupported: DataScannerViewController.isSupported, permission: CameraPermission.status)`。`.checkingPermission` なら `await CameraPermission.request()` → 再 resolve。
- `.scanning` のとき `DataScannerView(onScan:)` を全面表示 + 閉じるボタン + 案内テキスト。
- `onScan(payload)` ハンドラ: `guard !handled else { return }`。`guard let url = QRScanResult.deepLink(from: payload) else { invalidFlash を 2 秒表示; return }`。`handled = true; onResult(url)`。
- 閉じるボタン → `onCancel()`。

### `InviteQRView`（SwiftUI View・@MainActor）

```swift
struct InviteQRView: View {
    let urlString: String       // 例: InviteURL.room(inviteCode:)
    // @State image: UIImage? = nil、.task(id: urlString) で QRCodeGenerator.image(from:) を一度だけ生成しキャッシュ
}
```

公開 prop 契約: `urlString: String`（唯一の入力）。空コードを含む URL（末尾が空）でも `QRCodeGenerator.image` は非 nil を返し得るが、**呼び出し側が「code が空の間は `InviteQRView` を出さずスケルトンにする」**（表示側の責務）。`InviteQRView` 自体は image が nil のとき `.redacted` 枠を描く。

---

## 挙動仕様

「○○のとき△△」を網羅。Reviewer はこれを根拠にテストを書く。番号ごとに具体入力を明記（曖昧表現禁止）。

### URL 生成 (U) — 純粋・シミュレータ可

- **U1**: `InviteURL.room(inviteCode: "ABC")` は `"https://atender.appily.run/rooms/join/ABC"` に等しい。
- **U2**: `InviteURL.friend(inviteCode: "XYZ")` は `"https://atender.appily.run/friends/add/XYZ"` に等しい。
- **U3**: `DeepLink.parse(URL(string: InviteURL.room(inviteCode: "ABC"))!)` は `.roomJoin(code: "ABC")` に等しい（生成 → 解析の往復一致）。
- **U4**: `DeepLink.parse(URL(string: InviteURL.friend(inviteCode: "XYZ"))!)` は `.friendAdd(code: "XYZ")` に等しい。

### QR 生成 (G) — 純粋・シミュレータ可

- **G1**: `QRCodeGenerator.image(from: "https://atender.appily.run/rooms/join/ABC")` は非 nil で、`size.width > 0 && size.height > 0`。
- **G2**: `QRCodeGenerator.image(from: "")` は nil。
- **G3**: 同一入力を 2 回呼ぶと同じ `size` を返す（決定的）。

### スキャン結果検証 (S) — 純粋・シミュレータ可（無効 QR 判定の核心）

- **S1**: `QRScanResult.deepLink(from: "https://atender.appily.run/rooms/join/ABC")` は非 nil、その URL の `DeepLink.parse` が `.roomJoin(code: "ABC")`。
- **S2**: `QRScanResult.deepLink(from: "https://atender.appily.run/friends/add/XYZ")` は非 nil（`.friendAdd(code: "XYZ")`）。
- **S3**: `QRScanResult.deepLink(from: "atender://friends/add/XYZ")`（カスタムスキーム）は非 nil（`DeepLink.parse` がスキーム両対応）。
- **S4**: `QRScanResult.deepLink(from: "https://example.com/foo/bar")`（他ドメイン・未知パス）は nil。
- **S5**: `QRScanResult.deepLink(from: "https://atender.appily.run/unknown/path/x")`（自ドメインだが未知パス）は nil。
- **S6**: `QRScanResult.deepLink(from: "")` は nil。
- **S7**: `QRScanResult.deepLink(from: "ただのテキスト メモ")`（非 URL）は nil。

### スキャナ状態解決 (V) — 純粋・シミュレータ可（実機不要でブランチ全網羅）

- **V1**: `resolve(isSupported: true, permission: .authorized)` == `.scanning`。
- **V2**: `resolve(isSupported: true, permission: .notDetermined)` == `.checkingPermission`。
- **V3**: `resolve(isSupported: true, permission: .denied)` == `.permissionDenied`。
- **V4**: `resolve(isSupported: true, permission: .restricted)` == `.permissionDenied`。
- **V5**: `resolve(isSupported: false, permission: .authorized)` == `.unsupported`。
- **V6**: `resolve(isSupported: false, permission: .denied)` == `.unsupported`（unsupported が権限より優先）。

### DataScanner / 画面挙動 (D) — 実機必須・自動化しない（下記テスト基盤参照）

- **D1**: 実機で対応端末 + 権限ありのとき、`.scanning` でライブカメラプレビューが出る。
- **D2**: ルーム招待 QR を読み取ると `onResult` が呼ばれ、ルームタブに切替 → `JoinRoomView` が join API を呼び、成功でルーム詳細へ遷移する。
- **D3**: 友達追加 QR を読み取ると友達タブに切替 → `AddFriendByInviteCodeView` が friend request を送る。
- **D4**: **友達追加シートからルーム QR** を読み取っても `handleDeepLink` が `selectedTab=.rooms` にするためルーム参加に流れる（クロス遷移）。
- **D5**: 初回スキャン時にシステムのカメラ許可ダイアログが出る（`NSCameraUsageDescription` 未宣言なら**クラッシュ**するので宣言必須）。
- **D6**: 権限を拒否すると `.permissionDenied` 画面（「設定を開く」ボタン）になる。
- **D7**: シミュレータでは `DataScannerViewController.isSupported == false` のため `.unsupported` 画面が出る（カメラは起動しない）。
- **D8**: atender 以外の QR（例: 適当な URL）を読み取ると「無効な QR コードです」が約 2 秒出て、スキャンは継続する（`handled` が立たない → 続けて有効 QR を読める）。
- **D9**: 有効 QR を 1 度読んだら `handled=true` になり、以降の検出は無視される（二重 join を防ぐ）。

---

## テスト基盤

- **フレームワーク**: XCTest（`AtenderTests/`、既存 157 GREEN 基準）。UI は `AtenderUITests/`（token 注入ハーネス）。
- **テスト配置**: `apps/ios/AtenderTests/QRInviteTests.swift`（純粋ロジック新規）。既存 `DeepLinkTests.swift` と同型の `@testable import Atender` + `XCTestCase`。
- **シミュレータで自動化できる範囲（純粋関数）**: U1–U4 / G1–G3 / S1–S7 / V1–V6。これらが本機能の**検証の主戦場**。QR 生成・招待 URL 生成・スキャン payload 検証・状態分岐はすべて UIKit/カメラ非依存の純粋関数に切り出してあり、`xcodebuild test`（iPhone 16 simulator）で走る。無効 QR の弾き（S4–S7）とクロス遷移前提（U3/U4 の往復一致）はここで担保する。
- **★ 実機必須（CI シミュレータで走らせない）**: D1–D9。理由 = **`DataScannerViewController.isSupported` はシミュレータで `false`** を返し、カメラプレビュー・バーコード認識・権限ダイアログはシミュレータに存在しない（researcher 実機必須確認済）。
  - Reviewer はこれらを**自動テスト化しない**。`AtenderTests` は純粋ロジックのみを対象にし、`DataScannerView` / `QRScannerScreen` のカメラ経路はテスト対象外とする（テストを書くと実機なしで必ず失敗し、known-failures を汚す）。
  - D1–D9 は**手動の実機チェックリスト**として本 doc に残す（Touri が TestFlight/実機ビルドで確認）。`QRScannerStateLogic.resolve`（V1–V6）が状態分岐を純粋側で全網羅しているので、実機で確認すべきは「カメラ実描画」と「実 QR の読み取り→遷移」だけに縮む。
- **known-failures**: 本機能はベースラインを増やさない（純粋テストは緑、カメラ経路はテスト化しない）。実機依存を「テスト不能」として未分類で残さないこと。

---

## リリース時チェックリスト（実装スコープ外・Touri/Leader 用）

- `project.yml` の `info.properties` に `NSCameraUsageDescription` 追加後、`xcodegen generate` で Info.plist が再生成される（Info.plist 手編集不可、CLAUDE.md 既知の罠）。
- 新機能配布時は `CFBundleVersion` を `"7"` → `"8"` にインクリメント。**互換破壊ではない**ので `MIN_IOS_BUILD` の引き上げは不要。
- カメラ利用の追加は App Store の輸出/プライバシー質問に影響しない（既存 `ITSAppUsesNonExemptEncryption: false` 据え置き）。

### project.yml 追加内容（位置: `targets.Atender.info.properties`、45 行 `ITSAppUsesNonExemptEncryption` の直後）

```yaml
        NSCameraUsageDescription: 招待QRコードを読み取るためにカメラを使用します。
```

文言の根拠: 用途（招待 QR の読み取り）を明示し、それ以外にカメラを使わないことが伝わる日本語。App Store Review Guideline 5.1.1（目的明示）を満たす。

---

## 不採用案

- **QR 生成に外部ライブラリ（zxing / QRCode SPM 等）を追加**: 却下。CoreImage `CIFilter.qrCodeGenerator()` が iOS13+ 標準で `import` だけで足りる（researcher compile-verified）。依存を増やさない。
- **スキャンに `AVCaptureMetadataOutput`（AVFoundation 直叩き）を使う**: 却下（保留代替）。`DataScannerViewController`（VisionKit）はプレビュー + 検出 + ハイライトを 1 VC で完結し SwiftUI ラッパも短い。target 17 で iOS16+ の DataScanner が無条件に使える。AVFoundation 直は低レベルで実装量が増える。**ただし将来シミュレータ動作や細かい制御が要るなら AVFoundation が代替**（isSupported=false の制約を回避できる）。今回は不要。
- **QR にエンコードするのを新しい短縮コード/独自スキームにする**: 却下。既存の https 招待 URL をそのまま入れれば、他アプリのカメラ/写真アプリで読んでも universal link として機能し、`DeepLink.parse` がアプリ内でも拾える。新形式は二重メンテになる。
- **スキャン結果に join/add ロジックを新規実装**: 却下。`AppRouter.handleDeepLink` → `JoinRoomView` / `AddFriendByInviteCodeView` が既に join/add を実行する。スキャナは URL を渡すだけ。
- **共有ボタンで QR 画像を共有**: 却下。URL を `ShareLink(item:)` で共有する方が、受け手がタップで即リンクに乗れて汎用的（画像は保存して見せるだけで一手増える）。QR は「対面でカメラを向ける」ユースケース、共有は「離れた相手にリンクを送る」ユースケースで役割が分かれる。
- **スキャナを `.sheet` で開く**: 却下。カメラは全面が自然なので `.fullScreenCover`。`.sheet` の medium/large detent はカメラプレビューに不向き。
- **スキャン導線を独立タブ/グローバルボタンに新設**: 却下。IA を変えない規約（CLAUDE.md）。既存の「リンクで参加」「友達を追加」フロー内に QR 手段を足すのが Web/iOS 共通の IA に沿う。
- **QR カード背景を semantic color（dark 追従）にする**: 却下。QR は黒 on 白でないと読み取り率が落ちる。カード面だけは `Color.white` 固定の例外（DESIGN.md の「中立はシステムに明け渡す」の合理的逸脱、理由 = スキャナビリティ）。
