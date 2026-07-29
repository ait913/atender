# apps/api/tests/fixtures

**TS リテラルで組んだ body では検出できない契約バグ**のための、クライアント実出力の逐語 fixture 置き場。

## `ios-eventkit-sync-body.json`

`POST /api/personal-events/eventkit-sync` に **iOS が実際に送る body の逐語バイト列**。
手で書いたものではなく、**リポジトリ内の実 Swift DTO を `swiftc` でビルドして `JSONEncoder` に食わせた出力**。

### なぜこの fixture が要るか

Swift の合成 `Codable` は Optional が nil のとき `encodeIfPresent` で書くので、
**`"key": null` ではなくキーそのものが JSON から消える**。
zod の bare `.nullable()` は null を許すが「キー欠落」は許さない
(`invalid_type` / `received: "undefined"` / `"Required"`)。

build 13 の実機ではこれが原因で eventkit-sync が毎回 400 になり、
「予定を取得できませんでした (サーバーエラー (HTTP 400))」が出ていた。実測した 400 body:

```json
{"success":false,"error":{"issues":[
 {"code":"invalid_type","expected":"string","received":"undefined","path":["events",0,"ekLastModified"],"message":"Required"},
 {"code":"invalid_type","expected":"string","received":"undefined","path":["events",0,"location"],"message":"Required"}],"name":"ZodError"}
```

**既存の `tests/eventkit-sync.test.ts` はこれを永久に検出できない** —
body を TS リテラルで組むので `location: null` を明示的に入れてしまい、
「キーが無い」形を一度も作らないため。

### 中身 (整形して再掲。★ の行がこの fixture の肝)

```jsonc
{
  "events": [
    {
      "ekCalendarId": "EK-CAL-A",
      "ekExternalId": "EK-EXT-0001",
      "ekLastModified": "2026-07-29T12:00:00.000Z",
      "ekOccurrenceStart": "2026-07-30T01:00:00.000Z",
      "end": "2026-07-30T02:00:00.000Z",
      "isAllDay": false,
      "start": "2026-07-30T01:00:00.000Z",
      "title": "打ち合わせ"
    },
    {
      "ekCalendarId": "EK-CAL-A",
      "ekExternalId": "EK-EXT-0002",
      "ekOccurrenceStart": "2026-07-31T00:00:00.000Z",
      "end": "2026-08-01T00:00:00.000Z",
      "isAllDay": true,
      "start": "2026-07-31T00:00:00.000Z",
      "title": "終日の予定"
    },
    {
      "ekCalendarId": "EK-CAL-B",
      "ekExternalId": "EK-EXT-0003",
      "ekLastModified": "2026-07-28T09:15:00.000Z",
      "ekOccurrenceStart": "2026-08-03T05:30:00.000Z",
      "end": "2026-08-03T06:30:00.000Z",
      "isAllDay": false,
      "location": "渋谷デンタルクリニック",
      "start": "2026-08-03T05:30:00.000Z",
      "title": "歯医者"
    }
  ],
  "range": {
    "from": "2026-07-30",
    "to": "2026-08-16"
  }
}
```

- `events[0]` … `location` **キーごと無い** (EK の `event.location` は大半の予定で nil) ★
- `events[1]` … `location` と `ekLastModified` の **両方が無い** (終日 + 未編集) ★
- `events[2]` … 両方あり。対照 (キーが揃うケース)

`range` は request の明示引数で `today()` に依存しないため、日付リテラルは腐らない
(サーバは `input.range` をそのまま窓に使う)。

### 生成方法 (再現手順)

`apps/ios/Atender/Core/Models/{DTOs,Enums}.swift` を作業ディレクトリへコピーし、
下記 `main.swift` と一緒に `xcrun swiftc DTOs.swift Enums.swift main.swift -o probe` でビルドして
`./probe > ios-eventkit-sync-body.json`。

encoder 設定は `apps/ios/Atender/Core/Networking/APIClient.swift:19-20`
(`keyEncodingStrategy = .useDefaultKeys`) と同一。`outputFormatting = [.sortedKeys]` だけ
差分レビューのために追加している (キーの並びは zod の検証結果に影響しない)。
ISO 文字列の作り方は `apps/ios/Atender/Core/Sync/EventKitReconciler.swift` の
`ISO8601DateFormatter.internet` (`[.withInternetDateTime, .withFractionalSeconds]`) と同一。

```swift
import Foundation

// apps/ios/Atender/Core/Sync/EventKitReconciler.swift の ISO 生成と同一設定
let iso: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f
}()
func s(_ t: String) -> String { iso.string(from: ISO8601DateFormatter().date(from: t)!) }

// EventKitStore.fetchSnapshots が作る EKEventSnapshot 相当を 3 件。
// 実カレンダーでは location が nil の予定が大半、lastModifiedDate も nil になりうる。
let events = [
    // (1) 場所なし・lastModified あり  ← 実機で最頻
    EventKitSyncEvent(
        ekExternalId: "EK-EXT-0001",
        ekCalendarId: "EK-CAL-A",
        ekOccurrenceStart: s("2026-07-30T01:00:00Z"),
        ekLastModified: s("2026-07-29T12:00:00Z"),
        start: s("2026-07-30T01:00:00Z"),
        end: s("2026-07-30T02:00:00Z"),
        isAllDay: false,
        title: "打ち合わせ",
        location: nil
    ),
    // (2) 場所なし・lastModified なし (両方欠落)
    EventKitSyncEvent(
        ekExternalId: "EK-EXT-0002",
        ekCalendarId: "EK-CAL-A",
        ekOccurrenceStart: s("2026-07-31T00:00:00Z"),
        ekLastModified: nil,
        start: s("2026-07-31T00:00:00Z"),
        end: s("2026-08-01T00:00:00Z"),
        isAllDay: true,
        title: "終日の予定",
        location: nil
    ),
    // (3) 両方あり (対照。ここだけキーが揃う)
    EventKitSyncEvent(
        ekExternalId: "EK-EXT-0003",
        ekCalendarId: "EK-CAL-B",
        ekOccurrenceStart: s("2026-08-03T05:30:00Z"),
        ekLastModified: s("2026-07-28T09:15:00Z"),
        start: s("2026-08-03T05:30:00Z"),
        end: s("2026-08-03T06:30:00Z"),
        isAllDay: false,
        title: "歯医者",
        location: "渋谷デンタルクリニック"
    ),
]

let input = EventKitSyncInput(
    range: .init(from: "2026-07-30", to: "2026-08-16"),
    events: events
)

// apps/ios/Atender/Core/Networking/APIClient.swift:19-20 と同一設定
let encoder = JSONEncoder()
encoder.keyEncodingStrategy = .useDefaultKeys
encoder.outputFormatting = [.sortedKeys]
let data = try encoder.encode(input)
FileHandle.standardOutput.write(data)
```

### 使い方

このファイルは **JSON.parse した結果をそのまま request body に渡す**こと。
TS の型を経由して組み直すと、欠落キーが `undefined` として復活してしまい
fixture の意味が消える (それが元のバグを見逃した理由そのもの)。
