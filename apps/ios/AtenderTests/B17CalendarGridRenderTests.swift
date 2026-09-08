import SwiftUI
import UIKit
import XCTest
@testable import Atender

/// build 17 設計 §6.1 / §6.2 (#B4 / #B6-#B13) — 罫線・ヘッダー帯・chip 左バーの
/// **実 View オフスクリーン描画**による検証。設計docのみを根拠に記述 (実装は未読)。
///
/// ★ 月の選び方: 設計 #B6 は anchor "2026-07-01" を例示するが、その月に「今日」が
///   含まれると accent の丸が走査線を汚す (実行日で結果が変わる)。線の検証は月に依存
///   しないので、今日を絶対に含まない過去月 "2020-05-01" を使う。#B10 のみ設計どおり
///   "2026-07-01" でも撮る。
@MainActor
final class B17CalendarGridRenderTests: XCTestCase {

    private let width: CGFloat = 345
    private let scale: CGFloat = 3
    private let pastAnchor = "2020-05-01"
    private let designAnchor = "2026-07-01"
    private let noSelection = "1970-01-01"

    // MARK: - 描画ヘルパ

    private struct Bitmap {
        let width: Int
        let height: Int
        let pixels: [UInt8]   // RGBA

        func rgba(x: Int, y: Int) -> (r: Int, g: Int, b: Int, a: Int) {
            let index = (y * width + x) * 4
            return (Int(pixels[index]), Int(pixels[index + 1]), Int(pixels[index + 2]), Int(pixels[index + 3]))
        }

        func same(_ lhs: (r: Int, g: Int, b: Int, a: Int), _ rhs: (r: Int, g: Int, b: Int, a: Int), tolerance: Int = 2) -> Bool {
            if abs(lhs.r - rhs.r) > tolerance { return false }
            if abs(lhs.g - rhs.g) > tolerance { return false }
            if abs(lhs.b - rhs.b) > tolerance { return false }
            if abs(lhs.a - rhs.a) > tolerance { return false }
            return true
        }
    }

    private func bitmap(of image: UIImage) throws -> Bitmap {
        let cg = try XCTUnwrap(image.cgImage, "cgImage が nil")
        var buffer = [UInt8](repeating: 0, count: cg.width * cg.height * 4)
        let maybeContext = CGContext(data: &buffer,
                                     width: cg.width,
                                     height: cg.height,
                                     bitsPerComponent: 8,
                                     bytesPerRow: cg.width * 4,
                                     space: CGColorSpaceCreateDeviceRGB(),
                                     bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
        let context = try XCTUnwrap(maybeContext, "CGContext が作れない")
        context.draw(cg, in: CGRect(x: 0, y: 0, width: cg.width, height: cg.height))
        return Bitmap(width: cg.width, height: cg.height, pixels: buffer)
    }

    private func render<V: View>(_ view: V, width: CGFloat, height: CGFloat = 900) throws -> UIImage {
        let renderer = ImageRenderer(content: view.frame(width: width))
        renderer.scale = scale
        renderer.proposedSize = ProposedViewSize(width: width, height: height)
        return try XCTUnwrap(renderer.uiImage, "ImageRenderer が nil")
    }

    private func month(anchor: String, events: [CalendarEvent] = [], available: CGFloat? = nil) -> some View {
        CalendarMonth(anchor: anchor,
                      selectedDate: noSelection,
                      events: events,
                      daySummaries: [:],
                      available: available,
                      onSelectDate: { _ in })
    }

    private func event(date: String, title: String = "予定", color: String = "#FF00FF") -> CalendarEvent {
        CalendarEvent(kind: .personal, id: "e-\(date)-\(title)", date: date, title: title,
                      startMinute: 540, endMinute: 630, color: color, subtitle: "", courseId: nil)
    }

    private func rgbOf(_ color: Color, style: UIUserInterfaceStyle) -> (r: Int, g: Int, b: Int) {
        let resolved = UIColor(color).resolvedColor(with: UITraitCollection(userInterfaceStyle: style))
        var r: CGFloat = 0
        var g: CGFloat = 0
        var b: CGFloat = 0
        var a: CGFloat = 0
        resolved.getRed(&r, green: &g, blue: &b, alpha: &a)
        return (Int((r * 255).rounded()), Int((g * 255).rounded()), Int((b * 255).rounded()))
    }

    private func near(_ pixel: (r: Int, g: Int, b: Int, a: Int), _ target: (r: Int, g: Int, b: Int), tolerance: Int) -> Bool {
        if abs(pixel.r - target.r) > tolerance { return false }
        if abs(pixel.g - target.g) > tolerance { return false }
        if abs(pixel.b - target.b) > tolerance { return false }
        return true
    }

    /// 列境界の device px (i = 1…6)
    private func boundaryDeviceX(_ index: Int) -> Int {
        Int((width * CGFloat(index) / 7 * scale).rounded())
    }

    // MARK: - #B4 曜日ヘッダー帯

    /// [#B4] 曜日ヘッダー帯は bgMuted。列境界 (=文字が無い x) に罫線は引かれていない
    func testB4WeekdayHeaderBandIsMutedAndHasNoVerticalRules() throws {
        let image = try render(CalendarWeekdayHeader(), width: width, height: 200)
        let map = try bitmap(of: image)
        let light = rgbOf(Color.bgMuted, style: .light)
        let dark = rgbOf(Color.bgMuted, style: .dark)
        let y = map.height / 2

        for i in 1...6 {
            let center = boundaryDeviceX(i)
            for dx in -1...1 {
                let x = min(max(center + dx, 0), map.width - 1)
                let pixel = map.rgba(x: x, y: y)
                let ok = near(pixel, light, tolerance: 3) || near(pixel, dark, tolerance: 3)
                XCTAssertTrue(ok,
                              "[#B4] 列境界 i=\(i) dx=\(dx) の帯色が bgMuted でない (実測 \(pixel) / light \(light) / dark \(dark))")
            }
        }
    }

    /// [#B4 対照] 帯の色は素の背景 (bgElevated) とは違う = 「帯がある」ことの証明
    func testB4bMutedBandDiffersFromElevated() {
        let muted = rgbOf(Color.bgMuted, style: .light)
        let elevated = rgbOf(Color.bgElevated, style: .light)
        let distance = abs(muted.r - elevated.r) + abs(muted.g - elevated.g) + abs(muted.b - elevated.b)
        XCTAssertGreaterThan(distance, 3, "[#B4] bgMuted と bgElevated が同色で帯が見えない")
    }

    // MARK: - #B6/#B7/#B8 罫線

    /// [#B6] 縦罫線: 列境界 6 本が全 6 行の走査線で素の面と異なる
    func testB6VerticalRulesExistOnEveryRow() throws {
        let image = try render(month(anchor: pastAnchor), width: width)
        let map = try bitmap(of: image)
        let rows = CalendarMonthLayout.rowCount
        let rowPixelHeight = map.height / rows

        for row in 0..<rows {
            let y = row * rowPixelHeight + rowPixelHeight / 2
            let plainX = Int((width * 1.75 / 7 * scale).rounded())
            let plain = map.rgba(x: plainX, y: y)
            for i in 1...6 {
                let center = boundaryDeviceX(i)
                let candidates = (-1...1).map { map.rgba(x: min(max(center + $0, 0), map.width - 1), y: y) }
                let differs = candidates.contains { map.same($0, plain, tolerance: 2) == false }
                XCTAssertTrue(differs,
                              "[#B6] row=\(row) 列境界 i=\(i) に縦罫線が無い (境界 \(candidates) / 素の面 \(plain))")
            }
        }
    }

    /// [#B7] 対照: 素の面同士は同色 (= 計測が「何でも違う」わけではない)
    func testB7PlainSurfacePixelsAreEqual() throws {
        let image = try render(month(anchor: pastAnchor), width: width)
        let map = try bitmap(of: image)
        let rows = CalendarMonthLayout.rowCount
        let rowPixelHeight = map.height / rows

        for row in 0..<rows {
            let y = row * rowPixelHeight + rowPixelHeight / 2
            for i in 1...5 {
                let a = map.rgba(x: Int((width * (CGFloat(i) + 0.55) / 7 * scale).rounded()), y: y)
                let b = map.rgba(x: Int((width * (CGFloat(i) + 0.75) / 7 * scale).rounded()), y: y)
                XCTAssertTrue(map.same(a, b, tolerance: 2),
                              "[#B7] row=\(row) i=\(i) の素の面同士が違う色 (\(a) vs \(b)) — 計測が無力")
            }
        }
    }

    /// [#B8] 横罫線: 行境界 5 本が行の中ほどと異なる
    func testB8HorizontalRulesExist() throws {
        let image = try render(month(anchor: pastAnchor), width: width)
        let map = try bitmap(of: image)
        let rows = CalendarMonthLayout.rowCount
        let rowPixelHeight = CGFloat(map.height) / CGFloat(rows)
        let x = Int((width * 2.75 / 7 * scale).rounded())

        for row in 1..<rows {
            let boundary = Int((rowPixelHeight * CGFloat(row)).rounded())
            let mid = Int(rowPixelHeight * (CGFloat(row) - 0.5))
            let plain = map.rgba(x: x, y: mid)
            let candidates = (-1...1).map { map.rgba(x: x, y: min(max(boundary + $0, 0), map.height - 1)) }
            let differs = candidates.contains { map.same($0, plain, tolerance: 2) == false }
            XCTAssertTrue(differs, "[#B8] 行境界 \(row) に横罫線が無い (境界 \(candidates) / 行中 \(plain))")
        }
    }

    /// [#B9] 外周の枠は無い + 罫線は縦 6 本 / 横 5 本ちょうど。
    /// ★ 実測で判明: `CalendarMonth` 自身は面を塗らず (alpha 0)、罫線だけが不透明画素を作る。
    ///   設計の「borderSubtle の生解決色が外周に現れない」は separator が半透明のため
    ///   ビットマップ上に生色として決して現れず、逐語実装すると恒真になる。
    ///   ここでは「外周に不透明画素が並ばない (角が透明、辺の大半が透明)」+「本数ちょうど」で判定する。
    func testB9NoOuterBorderAndExactRuleCounts() throws {
        let image = try render(month(anchor: pastAnchor), width: width)
        let map = try bitmap(of: image)

        for point in [(0, 0), (map.width - 1, 0), (0, map.height - 1), (map.width - 1, map.height - 1)] {
            let pixel = map.rgba(x: point.0, y: point.1)
            XCTAssertEqual(pixel.a, 0, "[#B9] 角 (\(point.0),\(point.1)) に描画がある = 外周の枠がある")
        }

        func runs(alongRow y: Int) -> Int {
            var count = 0
            var inside = false
            for x in 0..<map.width {
                let opaque = map.rgba(x: x, y: y).a > 0
                if opaque, inside == false { count += 1 }
                inside = opaque
            }
            return count
        }
        func runs(alongColumn x: Int) -> Int {
            var count = 0
            var inside = false
            for y in 0..<map.height {
                let opaque = map.rgba(x: x, y: y).a > 0
                if opaque, inside == false { count += 1 }
                inside = opaque
            }
            return count
        }
        func transparentRatio(alongRow y: Int) -> Double {
            var clear = 0
            for x in 0..<map.width where map.rgba(x: x, y: y).a == 0 { clear += 1 }
            return Double(clear) / Double(map.width)
        }
        func transparentRatio(alongColumn x: Int) -> Double {
            var clear = 0
            for y in 0..<map.height where map.rgba(x: x, y: y).a == 0 { clear += 1 }
            return Double(clear) / Double(map.height)
        }

        XCTAssertEqual(runs(alongRow: 0), 6, "[#B9] 最上行を横切る不透明の帯が 6 本でない = 縦罫線が 6 本でない or 外枠がある")
        XCTAssertEqual(runs(alongRow: map.height - 1), 6, "[#B9] 最下行を横切る帯が 6 本でない")
        XCTAssertEqual(runs(alongColumn: 0), 5, "[#B9] 最左列を横切る帯が 5 本でない = 横罫線が 5 本でない or 外枠がある")
        XCTAssertEqual(runs(alongColumn: map.width - 1), 5, "[#B9] 最右列を横切る帯が 5 本でない")

        XCTAssertGreaterThan(transparentRatio(alongRow: 0), 0.9, "[#B9] 最上行の大半が塗られている = 外枠がある")
        XCTAssertGreaterThan(transparentRatio(alongRow: map.height - 1), 0.9, "[#B9] 最下行の大半が塗られている")
        XCTAssertGreaterThan(transparentRatio(alongColumn: 0), 0.9, "[#B9] 最左列の大半が塗られている")
        XCTAssertGreaterThan(transparentRatio(alongColumn: map.width - 1), 0.9, "[#B9] 最右列の大半が塗られている")
    }

    /// [#G17-7] 罫線の実測 x 位置が「等幅 7 列 (49.0pt 刻み)」と一致する
    /// (375pt 端末 = カード padding 0 の実効幅 343 を渡す)
    func testG17gRuleXPositionsMatchEqualColumns() throws {
        let effective: CGFloat = 375 - Space.pagePxMobile * 2   // = 343
        let image = try render(month(anchor: pastAnchor), width: effective)
        let map = try bitmap(of: image)
        let rowPixelHeight = CGFloat(map.height) / CGFloat(CalendarMonthLayout.rowCount)
        let y = Int(rowPixelHeight * 0.5)
        let plain = map.rgba(x: Int((effective * 2.75 / 7 * scale).rounded()), y: y)

        var ruleXs: [Int] = []
        var previousWasRule = false
        for x in 0..<map.width {
            let isRule = map.same(map.rgba(x: x, y: y), plain, tolerance: 2) == false
            if isRule, previousWasRule == false { ruleXs.append(x) }
            previousWasRule = isRule
        }
        XCTAssertEqual(ruleXs.count, 6, "[#G17-7] 縦罫線が 6 本でない (実測 \(ruleXs.count) 本 / x=\(ruleXs))")
        let columnWidth = effective / 7
        XCTAssertEqual(columnWidth, 49.0, accuracy: 0.001, "[#G17-7] 前提: 343/7 が 49.0 でない")
        for (index, x) in ruleXs.enumerated() {
            let expected = columnWidth * CGFloat(index + 1) * scale
            XCTAssertEqual(CGFloat(x), expected, accuracy: 3.0,
                           "[#G17-7] \(index + 1) 本目の罫線 x が 49.0pt 刻みでない (実測 \(x) / 期待 \(expected))")
        }
    }

    // MARK: - #B10 レイアウト不変

    /// [#B10] 幅は提案幅どおり / 予定 0 件と 3 件で寸法が変わらない
    func testB10SizeIsStableRegardlessOfEvents() throws {
        let empty = try render(month(anchor: designAnchor), width: width)
        let busyEvents = (0..<3).map { event(date: "2026-07-15", title: "予定\($0)") }
        let busy = try render(month(anchor: designAnchor, events: busyEvents), width: width)
        XCTAssertEqual(empty.size.width, width, accuracy: 0.75, "[#B10] 幅が提案幅でない")
        XCTAssertEqual(busy.size.width, width, accuracy: 0.75, "[#B10] 予定ありで幅が変わった")
        XCTAssertEqual(empty.size.height, busy.size.height, accuracy: 0.75,
                       "[#B10] 予定の件数で高さが変わった (\(empty.size.height) vs \(busy.size.height))")
        XCTAssertEqual(empty.size.height, 86 * 6, accuracy: 1.0,
                       "[#B10] available 未指定時の高さが 86×6 でない (実測 \(empty.size.height))")
    }

    /// [#B10 対照] 予定を足せば描画自体は変わる (計測が無力でない)
    func testB10bEventsDoChangeRendering() throws {
        let empty = try render(month(anchor: designAnchor), width: width)
        let busy = try render(month(anchor: designAnchor, events: [event(date: "2026-07-15")]), width: width)
        XCTAssertNotEqual(empty.pngData(), busy.pngData(), "[#B10] 予定を足しても描画が同一 (計測が無力)")
    }

    // MARK: - #B11/#B12/#B13 chip の左バー

    private func rawMagentaCount(in map: Bitmap, leadingPixels: Int) -> Int {
        var raw = 0
        for y in 0..<map.height {
            for x in 0..<min(leadingPixels, map.width) {
                let pixel = map.rgba(x: x, y: y)
                if pixel.a <= 250 { continue }
                if pixel.r < 250 { continue }
                if pixel.g > 5 { continue }
                if pixel.b < 250 { continue }
                raw += 1
            }
        }
        return raw
    }

    /// [#B11] chip には生の科目色が 1 px も出ない (2pt 左バーの完全削除)
    func testB11ChipHasNoLeadingColorBar() throws {
        let image = try render(CalendarDayEventChip(event: event(date: "2026-07-15", title: "")), width: 100, height: 60)
        let map = try bitmap(of: image)
        let leading = rawMagentaCount(in: map, leadingPixels: 30)
        XCTAssertEqual(leading, 0, "[#B11] chip の左端 10pt に生 #FF00FF が \(leading) px 残っている (2pt 左バー未削除)")
        let whole = rawMagentaCount(in: map, leadingPixels: map.width)
        XCTAssertEqual(whole, 0, "[#B11] chip 全体に生 #FF00FF が \(whole) px ある (面が tint でない)")
    }

    /// [#B12] 対照: 時間割タイルの左バーは維持されている (= 計測が有効)
    /// ★ 実測: バーはタイル leading から 6pt 内側 (device px 18-23) にある
    func testB12EventTileKeepsLeadingColorBar() throws {
        let image = try render(EventTile(title: "授業", color: "#FF00FF"), width: 100, height: 120)
        let map = try bitmap(of: image)
        let raw = rawMagentaCount(in: map, leadingPixels: 30)
        XCTAssertGreaterThan(raw, 0, "[#B12] EventTile の 2pt 左バーが消えている (DESIGN §3.6.1 の退行)")

        var minX = Int.max
        var maxX = -1
        for y in 0..<map.height {
            for x in 0..<map.width {
                let pixel = map.rgba(x: x, y: y)
                if pixel.a <= 250 { continue }
                if pixel.r < 250 { continue }
                if pixel.g > 5 { continue }
                if pixel.b < 250 { continue }
                minX = min(minX, x)
                maxX = max(maxX, x)
            }
        }
        XCTAssertEqual(CGFloat(maxX - minX + 1) / scale, 2.0, accuracy: 0.5,
                       "[#B12] EventTile の左バー幅が 2pt でない (device px \(minX)…\(maxX))")
        XCTAssertLessThanOrEqual(CGFloat(minX) / scale, 10,
                                 "[#B12] 左バーが leading 側に無い (x=\(minX) device px)")
    }

    /// [#B13] chip の面は opaqueTint(hex:ratio:base:)
    func testB13ChipSurfaceUsesOpaqueTint() throws {
        let image = try render(CalendarDayEventChip(event: event(date: "2026-07-15", title: "")), width: 100, height: 60)
        let map = try bitmap(of: image)
        var histogram: [String: Int] = [:]
        for y in 0..<map.height {
            for x in 0..<map.width {
                let pixel = map.rgba(x: x, y: y)
                if pixel.a <= 250 { continue }
                histogram["\(pixel.r),\(pixel.g),\(pixel.b)", default: 0] += 1
            }
        }
        let dominant = try XCTUnwrap(histogram.max(by: { $0.value < $1.value })?.key, "[#B13] 不透明画素が無い")
        let parts = dominant.split(separator: ",").compactMap { Int($0) }
        XCTAssertEqual(parts.count, 3, "[#B13] 色の解析に失敗")

        let expectedColor = Color.opaqueTint(hex: "#FF00FF", ratio: Color.surfaceTintRatio, base: .bgElevated)
        let light = rgbOf(expectedColor, style: .light)
        let dark = rgbOf(expectedColor, style: .dark)
        let distanceLight = abs(parts[0] - light.r) + abs(parts[1] - light.g) + abs(parts[2] - light.b)
        let distanceDark = abs(parts[0] - dark.r) + abs(parts[1] - dark.g) + abs(parts[2] - dark.b)
        XCTAssertTrue(min(distanceLight, distanceDark) <= 9,
                      "[#B13] chip の面が opaqueTint でない (実測 \(parts) / light \(light) / dark \(dark))")

        let rawDistance = abs(parts[0] - 255) + abs(parts[1] - 0) + abs(parts[2] - 255)
        XCTAssertGreaterThan(rawDistance, 30, "[#B13] chip の面が生の科目色そのもの (tint されていない)")
    }
}
