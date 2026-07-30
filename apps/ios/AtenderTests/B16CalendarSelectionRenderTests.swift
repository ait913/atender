import SwiftUI
import UIKit
import XCTest
@testable import Atender

/// build 16 設計 §6.2 #C11 / #C12 と §6.3 #H4。
/// 「選択日のセル塗りが実際に描かれているか」を ImageRenderer の対 (差が出る側 / 出ない側) で測る。
/// pattern/offscreen-render-diff-pair-for-negative-drawing.md に従い、
/// 「変わらない」assert だけを書かず「変わる」assert を同じランに置く。
@MainActor
final class B16CalendarSelectionRenderTests: XCTestCase {

    // MARK: - 標本日付 (実行日から導出。リテラルの月を焼くと翌月に陳腐化する)

    private let today = SchoolClock.todayString()
    private var anchor: String { CalendarRange.monthFirst(today) }
    /// 当月内で today とは別の日
    private var otherDay: String {
        let prefix = String(today.prefix(8))
        if today.hasSuffix("15") { return prefix + "16" }
        return prefix + "15"
    }
    /// 当月内で today / otherDay とも別の日
    private var thirdDay: String {
        let prefix = String(today.prefix(8))
        for dd in ["10", "11", "12", "13"] where prefix + dd != today {
            return prefix + dd
        }
        return prefix + "10"
    }

    // MARK: - レンダ

    private func event(date: String, color: String = "#FF00FF") -> CalendarEvent {
        CalendarEvent(kind: .personal,
                      id: "e-\(date)",
                      date: date,
                      title: "予定",
                      startMinute: 540,
                      endMinute: 630,
                      color: color,
                      subtitle: "",
                      courseId: "")
    }

    private func image(selectedDate: String, events: [CalendarEvent] = []) throws -> UIImage {
        let view = CalendarMonth(anchor: anchor,
                                 selectedDate: selectedDate,
                                 events: events,
                                 daySummaries: [:],
                                 onSelectDate: { _ in })
            .frame(width: 345)
        let renderer = ImageRenderer(content: view)
        renderer.scale = 3
        renderer.proposedSize = ProposedViewSize(width: 345, height: 500)
        return try XCTUnwrap(renderer.uiImage, "ImageRenderer が nil")
    }

    private func png(selectedDate: String, events: [CalendarEvent] = []) throws -> Data {
        let rendered = try image(selectedDate: selectedDate, events: events)
        return try XCTUnwrap(rendered.pngData(), "pngData が nil")
    }

    // MARK: - ピクセル計測

    private struct RGB {
        let r: Int
        let g: Int
        let b: Int
    }

    private func rgb(_ color: UIColor, style: UIUserInterfaceStyle) -> RGB {
        let resolved = color.resolvedColor(with: UITraitCollection(userInterfaceStyle: style))
        var r: CGFloat = 0
        var g: CGFloat = 0
        var b: CGFloat = 0
        var a: CGFloat = 0
        resolved.getRed(&r, green: &g, blue: &b, alpha: &a)
        return RGB(r: Int((r * 255).rounded()), g: Int((g * 255).rounded()), b: Int((b * 255).rounded()))
    }

    /// 指定色 (light / dark どちらの解決値でも可) に一致する不透明画素の数
    private func pixelCount(_ img: UIImage, matching targets: [RGB], tolerance: Int = 3) throws -> Int {
        let cg = try XCTUnwrap(img.cgImage, "cgImage が nil")
        let width = cg.width
        let height = cg.height
        var buffer = [UInt8](repeating: 0, count: width * height * 4)
        let space = CGColorSpaceCreateDeviceRGB()
        let maybeCtx = CGContext(data: &buffer,
                                 width: width,
                                 height: height,
                                 bitsPerComponent: 8,
                                 bytesPerRow: width * 4,
                                 space: space,
                                 bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
        let ctx = try XCTUnwrap(maybeCtx, "CGContext が作れない")
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: width, height: height))
        var hits = 0
        for index in stride(from: 0, to: buffer.count, by: 4) {
            let a = Int(buffer[index + 3])
            if a <= 250 { continue }
            let r = Int(buffer[index])
            let g = Int(buffer[index + 1])
            let b = Int(buffer[index + 2])
            for target in targets {
                if abs(r - target.r) > tolerance { continue }
                if abs(g - target.g) > tolerance { continue }
                if abs(b - target.b) > tolerance { continue }
                hits += 1
                break
            }
        }
        return hits
    }

    private var selectionFillTargets: [RGB] {
        [rgb(UIColor(Color.calendarSelectedDay), style: .light),
         rgb(UIColor(Color.calendarSelectedDay), style: .dark)]
    }

    private var accentTargets: [RGB] {
        [rgb(UIColor(Color.accent500), style: .light),
         rgb(UIColor(Color.accent500), style: .dark)]
    }

    // MARK: - #C11

    /// ハーネスの健全性: 同じ入力なら PNG は決定的 (崩れると以下の NotEqual が無意味になる)
    func testC11aRenderIsDeterministic() throws {
        XCTAssertEqual(try png(selectedDate: otherDay), try png(selectedDate: otherDay),
                       "[build16 #C11] 同一入力で PNG が変わる = 計測が無力")
    }

    /// [#C11] 選択日を変えると描画が変わる
    func testC11bChangingSelectedDateChangesRendering() throws {
        XCTAssertNotEqual(try png(selectedDate: otherDay), try png(selectedDate: thirdDay),
                          "[build16 #C11] 選択日を変えても描画が変わらない = セル塗りが配線されていない")
    }

    /// [#C11] 選択が無い (空文字) 状態と比べて、選択日があると描画が変わる (#C7 の描画版)
    func testC11cEmptySelectionDrawsNoFill() throws {
        XCTAssertNotEqual(try png(selectedDate: ""), try png(selectedDate: otherDay),
                          "[build16 #C11/#C7] 選択日の塗りが描かれていない")
    }

    /// [#C11] 塗りが「Color.calendarSelectedDay の色で、日セル 1 個分の面積」で描かれている
    /// (PNG 不一致だけでは「何かが変わった」までしか言えないので色と面積で裏を取る)
    func testC11dSelectionFillUsesTokenColorWithCellSizedArea() throws {
        let unselected = try pixelCount(try image(selectedDate: ""), matching: selectionFillTargets)
        let selected = try pixelCount(try image(selectedDate: otherDay), matching: selectionFillTargets)
        let delta = selected - unselected
        // scale 3 / 幅 345pt の 7 列 → 1 セルは概ね 40x50pt ≒ 18,000 device px。
        // 下限は「日セル 1 個として説明できる最小」(20x20pt = 3,600 device px) を採る。
        XCTAssertGreaterThan(delta, 3_600,
                             "[build16 #C11] token 色の画素がセル 1 個分増えていない (delta=\(delta))")
        XCTAssertLessThan(delta, 60_000,
                          "[build16 #C11] 塗りが 1 セルを大きく超えている (delta=\(delta))")
    }

    // MARK: - #C12 今日 = 選択日でも accent の塗り丸が消えない

    /// [#C12] 「今日を選択した」描画にも accent 画素が残り、他日を選択したときと同量
    /// (= グレーのセル塗りが today の accent 丸を上書き / 置換していない)
    func testC12TodaySelectionKeepsAccentCircle() throws {
        let todaySelected = try image(selectedDate: today)
        let otherSelected = try image(selectedDate: otherDay)

        let accentWhenTodaySelected = try pixelCount(todaySelected, matching: accentTargets)
        let accentWhenOtherSelected = try pixelCount(otherSelected, matching: accentTargets)

        XCTAssertGreaterThan(accentWhenOtherSelected, 300,
                             "[build16 #C12] 今日の accent 塗り丸が描かれていない (計測が無力な可能性)")
        XCTAssertGreaterThan(accentWhenTodaySelected, 300,
                             "[build16 #C12] 今日を選択すると accent 塗り丸が消える")
        let diff = abs(accentWhenTodaySelected - accentWhenOtherSelected)
        XCTAssertLessThan(diff, max(accentWhenOtherSelected / 5, 40),
                          "[build16 #C12] accent 画素数が選択有無で大きく変わる "
                          + "(today=\(accentWhenTodaySelected) other=\(accentWhenOtherSelected))")
    }

    /// [#C12] 今日を選択した描画は「他日を選択した描画」と異なる (グレー塗りが today セルに入る)
    func testC12TodaySelectionDiffersFromOtherSelection() throws {
        XCTAssertNotEqual(try png(selectedDate: today), try png(selectedDate: otherDay),
                          "[build16 #C12] 今日を選択してもセル塗りが動かない")
    }

    /// [#C12] 今日のセルにもグレー塗りが入る (accent 丸との併存)
    func testC12TodayCellAlsoGetsGrayFill() throws {
        let noSelection = try pixelCount(try image(selectedDate: ""), matching: selectionFillTargets)
        let todaySelected = try pixelCount(try image(selectedDate: today), matching: selectionFillTargets)
        XCTAssertGreaterThan(todaySelected - noSelection, 3_600,
                             "[build16 #C12] 今日を選択したときグレー塗りが増えない "
                             + "(no=\(noSelection) today=\(todaySelected))")
    }

    // MARK: - #H4 chip の描画 (選択塗りを固定した対)

    /// [#H4] 当月内の日に chip を足すと描画が変わる (chip が今も描かれている)
    func testH4InsideMonthChipStillDrawn() throws {
        let selected = otherDay
        let empty = try png(selectedDate: selected)
        let withChip = try png(selectedDate: selected, events: [event(date: thirdDay)])
        XCTAssertNotEqual(empty, withChip, "[build16 #H4] chip が描かれていない")
    }

    /// [#H4] 当月外の日に chip を足しても描画は変わらない (§9.1「#R1 は壊れない」の再確認)
    func testH4OutsideMonthChipStillNotDrawn() throws {
        let selected = otherDay
        let outside = previousMonthDay()
        let empty = try png(selectedDate: selected)
        let withOutsideChip = try png(selectedDate: selected, events: [event(date: outside)])
        XCTAssertEqual(empty, withOutsideChip,
                       "[build16 #H4/#R1] 当月外の chip が描かれている (outside=\(outside))")
    }

    /// anchor の前月末日 (グリッド先頭行に出る当月外の日)
    private func previousMonthDay() -> String {
        let formatter = DateFormatter()
        formatter.calendar = SchoolClock.calendar
        formatter.timeZone = SchoolClock.timeZone
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        guard let first = formatter.date(from: anchor) else { return anchor }
        guard let prev = SchoolClock.calendar.date(byAdding: .day, value: -1, to: first) else { return anchor }
        return formatter.string(from: prev)
    }
}
