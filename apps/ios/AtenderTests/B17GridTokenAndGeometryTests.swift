import SwiftUI
import UIKit
import XCTest
@testable import Atender

/// build 17 設計 §6.1 の定数 (#B1/#B3/#B5) と §3.2.1 のタップ領域検算。
/// 設計docのみを根拠に記述 (実装は未読)。
@MainActor
final class B17GridTokenAndGeometryTests: XCTestCase {

    /// [#B1] 列間 gap は 0 (罫線が分離を担う)
    func testB1ColumnSpacingIsZero() {
        XCTAssertEqual(CalendarMonthLayout.columnSpacing, 0, accuracy: 0.0001,
                       "[#B1] columnSpacing が 0 でない (罫線 + 溝の二重分離になる)")
        XCTAssertEqual(CalendarMonthLayout.rowSpacing, 0, accuracy: 0.0001, "[#B1] rowSpacing が 0 でない")
    }

    /// [#B1 対照] 旧値 Space.s0_5 (=2) から実際に変わっていること
    func testB1bColumnSpacingIsNoLongerSpaceHalf() {
        XCTAssertEqual(Space.s0_5, 2, accuracy: 0.0001, "[#B1] 前提: Space.s0_5 が 2 でない")
        XCTAssertNotEqual(CalendarMonthLayout.columnSpacing, Space.s0_5,
                          "[#B1] columnSpacing がまだ Space.s0_5 のまま")
    }

    /// [#B3] 罫線トークンの単一定義
    func testB3GridLineToken() {
        XCTAssertEqual(AtenderGridLine.width, 1, accuracy: 0.0001, "[#B3] 罫線の太さが 1 でない")
        let line = UIColor(AtenderGridLine.color)
        let subtle = UIColor(Color.borderSubtle)
        for style in [UIUserInterfaceStyle.light, .dark] {
            let traits = UITraitCollection(userInterfaceStyle: style)
            XCTAssertEqual(line.resolvedColor(with: traits), subtle.resolvedColor(with: traits),
                           "[#B3] AtenderGridLine.color が Color.borderSubtle と違う (\(style.rawValue))")
        }
    }

    /// [#B5] 曜日ヘッダー帯の高さ
    func testB5WeekdayHeaderHeight() throws {
        XCTAssertEqual(CalendarMonthLayout.weekdayHeaderHeight, 26, accuracy: 0.0001,
                       "[#B5] weekdayHeaderHeight 定数が 26 でない")
        let renderer = ImageRenderer(content: CalendarWeekdayHeader().frame(width: 345))
        renderer.scale = 3
        renderer.proposedSize = ProposedViewSize(width: 345, height: 500)
        let image = try XCTUnwrap(renderer.uiImage, "[#B5] ImageRenderer が nil")
        XCTAssertEqual(image.size.height, CalendarMonthLayout.weekdayHeaderHeight, accuracy: 0.75,
                       "[#B5] 実描画の高さが weekdayHeaderHeight と違う (実測 \(image.size.height))")
        XCTAssertEqual(image.size.width, 345, accuracy: 0.75, "[#B5] 実描画の幅が提案幅と違う")
    }

    // MARK: - §3.2.1 タップ領域の検算 (設計が主張する 45.0 → 49.0)

    /// 設計 §3.2.1 の新レイアウト式: (画面幅 − pagePx×2 − columnSpacing×6) ÷ 7
    private func newCellWidth(screenWidth: CGFloat) -> CGFloat {
        let columns = CGFloat(CalendarMonthLayout.columnCount)
        let content = screenWidth - Space.pagePxMobile * 2 - CalendarMonthLayout.columnSpacing * (columns - 1)
        return content / columns
    }

    /// 設計 §3.2.1 の旧レイアウト式: page16 + card padding 8 + gap 2
    private func legacyCellWidth(screenWidth: CGFloat) -> CGFloat {
        (screenWidth - Space.pagePxMobile * 2 - Space.s2 * 2 - Space.s0_5 * 6) / 7
    }

    /// [#G17-1] 375pt 端末で 49.0pt (設計 §3.2.1 の表)
    func testG17NewCellWidthOn375() {
        XCTAssertEqual(Space.pagePxMobile, 16, accuracy: 0.0001, "[#G17-1] 前提: pagePxMobile が 16 でない")
        XCTAssertEqual(newCellWidth(screenWidth: 375), 49.0, accuracy: 0.001,
                       "[#G17-1] 375pt 端末の日セル幅が 49.0 でない (実測 \(newCellWidth(screenWidth: 375)))")
    }

    /// [#G17-2] 旧レイアウトは 45.0 で、新は +4.0pt 広い (設計の主張の直接検算)
    func testG17bWidenedByFourPoints() {
        XCTAssertEqual(legacyCellWidth(screenWidth: 375), 45.0, accuracy: 0.001,
                       "[#G17-2] 旧式が 45.0 にならない (設計 §3.2.1 の前提が違う)")
        XCTAssertEqual(newCellWidth(screenWidth: 375) - legacyCellWidth(screenWidth: 375), 4.0, accuracy: 0.001,
                       "[#G17-2] 新旧差が +4.0pt でない")
    }

    /// [#G17-3] 393pt (iPhone 16) で 51.571…pt
    func testG17cNewCellWidthOn393() {
        XCTAssertEqual(newCellWidth(screenWidth: 393), (393.0 - 32.0) / 7.0, accuracy: 0.001,
                       "[#G17-3] 393pt 端末の日セル幅が (393-32)/7 でない")
        XCTAssertEqual(newCellWidth(screenWidth: 393), 51.571, accuracy: 0.01, "[#G17-3] 51.57 付近でない")
    }

    /// [#G17-4] 対応端末 (最小 320 = SE1 / 375 / 390 / 393 / 402 / 430) で 44pt を満たす
    func testG17dTapTargetIsAtLeast44() {
        for width in [375.0, 390.0, 393.0, 402.0, 430.0] as [CGFloat] {
            XCTAssertGreaterThanOrEqual(newCellWidth(screenWidth: width), 44,
                                        "[#G17-4] 幅 \(width) で日セル幅が 44pt 未満 (\(newCellWidth(screenWidth: width)))")
        }
    }

    /// [#G17-5] 行高は下限 70pt で、44pt を常に満たす
    func testG17eRowHeightAlwaysMeets44() {
        XCTAssertEqual(CalendarMonthLayout.minRowHeight, 70, accuracy: 0.0001, "[#G17-5] minRowHeight が 70 でない")
        for available in [0.0, 100.0, 300.0, 400.0, 500.0, 700.0, 900.0] as [CGFloat] {
            let height = CalendarMonthLayout.rowHeight(available: available)
            XCTAssertGreaterThanOrEqual(height, 70, "[#G17-5] available=\(available) で行高が 70 未満")
            XCTAssertGreaterThanOrEqual(height, 44, "[#G17-5] available=\(available) で行高が 44 未満")
        }
    }

    /// [#G17-6] 行高の式は max(minRowHeight, (available − weekdayHeaderHeight) / rowCount)
    func testG17fRowHeightFormula() {
        for available in [200.0, 500.0, 626.0, 900.0] as [CGFloat] {
            let expected = max(CalendarMonthLayout.minRowHeight,
                               (available - CalendarMonthLayout.weekdayHeaderHeight) / CGFloat(CalendarMonthLayout.rowCount))
            XCTAssertEqual(CalendarMonthLayout.rowHeight(available: available), expected, accuracy: 0.001,
                           "[#G17-6] available=\(available) の行高が式と違う")
        }
    }

    /// [#B1 補] CalendarGrid.columns は columnCount 個 / spacing は columnSpacing (曜日ヘッダーと日セルの共有列定義)
    func testB1cCalendarGridColumns() {
        XCTAssertEqual(CalendarGrid.columns.count, CalendarMonthLayout.columnCount,
                       "[#B1] CalendarGrid.columns の個数が columnCount でない")
        for item in CalendarGrid.columns {
            XCTAssertEqual(item.spacing ?? -1, CalendarMonthLayout.columnSpacing, accuracy: 0.0001,
                           "[#B1] GridItem.spacing が columnSpacing でない")
        }
    }
}
