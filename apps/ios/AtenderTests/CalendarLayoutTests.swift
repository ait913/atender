import CoreGraphics
import XCTest
@testable import Atender

final class CalendarLayoutTests: XCTestCase {

    func testCA1RowHeightUsesAvailableCalendarSpace() {
        let expected = (CGFloat(700) - CalendarMonthLayout.weekdayHeaderHeight) / CGFloat(CalendarMonthLayout.rowCount)

        XCTAssertEqual(CalendarMonthLayout.rowHeight(available: 700), expected, accuracy: 0.001, "[ui-revamp #CA1]")
    }

    func testCA2RowHeightClampsToMinimumWhenTooSmall() {
        XCTAssertEqual(CalendarMonthLayout.rowHeight(available: 300),
                       CalendarMonthLayout.minRowHeight,
                       accuracy: 0.001,
                       "[ui-revamp #CA2]")
    }

    func testCA3ContentHeightUsesHeaderAndRowsOnly() {
        let rowHeight = CalendarMonthLayout.rowHeight(available: 700)
        let expected = CalendarMonthLayout.weekdayHeaderHeight + rowHeight * CGFloat(CalendarMonthLayout.rowCount)

        XCTAssertEqual(CalendarMonthLayout.contentHeight(available: 700), expected, accuracy: 0.001, "[ui-revamp #CA3]")
    }

    func testCA4RowHeightNeverFallsBelowMinimum() {
        XCTAssertGreaterThanOrEqual(CalendarMonthLayout.rowHeight(available: 0),
                                    CalendarMonthLayout.minRowHeight,
                                    "[ui-revamp #CA4]")
        XCTAssertGreaterThanOrEqual(CalendarMonthLayout.rowHeight(available: 1),
                                    CalendarMonthLayout.minRowHeight,
                                    "[ui-revamp #CA4]")
    }

    func testCA5SelectedWinsOverToday() {
        XCTAssertEqual(CalendarDayStyle.emphasis(date: "2026-07-17",
                                                 todayString: "2026-07-17",
                                                 selectedDate: "2026-07-17",
                                                 monthFirst: "2026-07-01"),
                       .selected,
                       "[ui-revamp #CA5]")
    }

    func testCA6TodayInCurrentMonth() {
        XCTAssertEqual(CalendarDayStyle.emphasis(date: "2026-07-17",
                                                 todayString: "2026-07-17",
                                                 selectedDate: "2026-07-16",
                                                 monthFirst: "2026-07-01"),
                       .today,
                       "[ui-revamp #CA6]")
    }

    func testCA7TodayWinsOverOutsideMonth() {
        XCTAssertEqual(CalendarDayStyle.emphasis(date: "2026-06-30",
                                                 todayString: "2026-06-30",
                                                 selectedDate: "2026-07-01",
                                                 monthFirst: "2026-07-01"),
                       .today,
                       "[ui-revamp #CA7]")
    }

    func testCA8OutsideMonthWhenNotSelectedOrToday() {
        XCTAssertEqual(CalendarDayStyle.emphasis(date: "2026-06-30",
                                                 todayString: "2026-07-17",
                                                 selectedDate: "2026-07-01",
                                                 monthFirst: "2026-07-01"),
                       .outsideMonth,
                       "[ui-revamp #CA8]")
    }

    func testCA9NormalCurrentMonthDay() {
        XCTAssertEqual(CalendarDayStyle.emphasis(date: "2026-07-16",
                                                 todayString: "2026-07-17",
                                                 selectedDate: "2026-07-01",
                                                 monthFirst: "2026-07-01"),
                       .normal,
                       "[ui-revamp #CA9]")
    }

    func testCA10SelectedWinsForOutsideMonth() {
        XCTAssertEqual(CalendarDayStyle.emphasis(date: "2026-06-30",
                                                 todayString: "2026-07-17",
                                                 selectedDate: "2026-06-30",
                                                 monthFirst: "2026-07-01"),
                       .selected,
                       "[ui-revamp #CA10]")
    }
    // MARK: - 個人カレンダー再構築 §6.3 / §9 U7-U8 (Reviewer 生成)

    func testU7GridAvailableSubtractsCardChrome() {
        XCTAssertEqual(CalendarMonthLayout.gridAvailable(available: 600), 584, accuracy: 0.001, "[#U7]")
        XCTAssertEqual(CalendarMonthLayout.cardChromeHeight, 16, accuracy: 0.001, "[#U7] Space.s2 * 2")
    }

    func testU7GridAvailableNeverGoesNegative() {
        XCTAssertEqual(CalendarMonthLayout.gridAvailable(available: 10), 0, accuracy: 0.001, "[#U7]")
        XCTAssertEqual(CalendarMonthLayout.gridAvailable(available: 0), 0, accuracy: 0.001, "[#U7]")
    }

    func testU8RowHeightFormulaUnchanged() {
        XCTAssertEqual(CalendarMonthLayout.rowHeight(available: 626), 100, accuracy: 0.001, "[#U8] (available - 26) / 6")
    }

    // MARK: - カレンダー実機不具合の是正 §9-A / §9-B / §9-C (Reviewer 生成 / 設計docのみ根拠)

    // ---- §9-A columnWidths ----

    /// [calendar-defects #G1] 345pt / spacing 0 / scale 3 → 先頭 6 個が 148px, 末尾が 147px
    func testG1ColumnWidthsDistributesRemainderFromHead() {
        let widths = CalendarMonthLayout.columnWidths(totalWidth: 345, columns: 7, spacing: 0, displayScale: 3)

        XCTAssertEqual(widths.count, 7, "[calendar-defects #G1]")
        for index in 0..<6 {
            XCTAssertEqual(widths[index], 148.0 / 3.0, accuracy: 1e-6, "[calendar-defects #G1] col \(index)")
        }
        XCTAssertEqual(widths[6], 147.0 / 3.0, accuracy: 1e-6, "[calendar-defects #G1] last col")
        XCTAssertEqual(widths.reduce(0, +), 345.0, accuracy: 1e-6, "[calendar-defects #G1] sum")
    }

    /// [calendar-defects #G2] 設計 §9-A G2 の期待値 (143/3 x5, 142/3 x2) は
    /// **totalWidth=345, spacing=2** の場合の値。iPhone 16 の実値も 393-32(page)-16(card) = 345。
    func testG2ColumnWidthsOnIPhone16WithSpacing() {
        let widths = CalendarMonthLayout.columnWidths(totalWidth: 345, columns: 7, spacing: 2, displayScale: 3)

        XCTAssertEqual(widths.count, 7, "[calendar-defects #G2]")
        for index in 0..<5 {
            XCTAssertEqual(widths[index], 143.0 / 3.0, accuracy: 1e-6, "[calendar-defects #G2] col \(index)")
        }
        XCTAssertEqual(widths[5], 142.0 / 3.0, accuracy: 1e-6, "[calendar-defects #G2] col 5")
        XCTAssertEqual(widths[6], 142.0 / 3.0, accuracy: 1e-6, "[calendar-defects #G2] col 6")
        XCTAssertLessThanOrEqual(widths.reduce(0, +) + 2 * 6, 345.0 + 1e-6, "[calendar-defects #G2] fits")
    }

    /// [calendar-defects #G2b] 設計 §9-A G2 の文字どおりの入力 (totalWidth=333, spacing=2)。
    /// §1.4 の規範アルゴリズム (content = totalWidth - spacing*(columns-1)) に従う。
    func testG2bColumnWidthsLiteralSpecInput() {
        let widths = CalendarMonthLayout.columnWidths(totalWidth: 333, columns: 7, spacing: 2, displayScale: 3)

        XCTAssertEqual(widths.count, 7, "[calendar-defects #G2b]")
        for index in 0..<4 {
            XCTAssertEqual(widths[index], 138.0 / 3.0, accuracy: 1e-6, "[calendar-defects #G2b] col \(index)")
        }
        for index in 4..<7 {
            XCTAssertEqual(widths[index], 137.0 / 3.0, accuracy: 1e-6, "[calendar-defects #G2b] col \(index)")
        }
        XCTAssertLessThanOrEqual(widths.reduce(0, +) + 2 * 6, 333.0 + 1e-6, "[calendar-defects #G2b] fits")
    }

    /// [calendar-defects #G3] 等幅性 + device pixel 境界
    func testG3ColumnWidthsAreEqualAndPixelAligned() {
        for totalWidth in [CGFloat(320), 333, 345, 361, 375, 392, 408] {
            for displayScale in [CGFloat(2), 3] {
                let widths = CalendarMonthLayout.columnWidths(totalWidth: totalWidth,
                                                             columns: 7,
                                                             spacing: 2,
                                                             displayScale: displayScale)
                XCTAssertEqual(widths.count, 7, "[calendar-defects #G3] w=\(totalWidth) s=\(displayScale)")
                let spread = (widths.max() ?? 0) - (widths.min() ?? 0)
                XCTAssertLessThanOrEqual(spread, 1 / displayScale + 1e-6,
                                         "[calendar-defects #G3] spread w=\(totalWidth) s=\(displayScale)")
                for width in widths {
                    let px = width * displayScale
                    XCTAssertEqual(px, px.rounded(), accuracy: 1e-6,
                                   "[calendar-defects #G3] not pixel aligned w=\(totalWidth) s=\(displayScale)")
                }
            }
        }
    }

    /// [calendar-defects #G3-dev] 実デバイス幅 375 / 393 / 402 / 430 / 440 でも等幅・pixel 境界・非溢れ
    func testG3DeviceWidthsAreEqualAndPixelAligned() {
        // 月カレンダーカードの内側幅 = 画面幅 - page margin 16*2 - card padding 8*2
        for screenWidth in [CGFloat(375), 393, 402, 430, 440] {
            let totalWidth = screenWidth - 32 - 16
            for displayScale in [CGFloat(2), 3] {
                let widths = CalendarMonthLayout.columnWidths(totalWidth: totalWidth,
                                                              columns: CalendarMonthLayout.columnCount,
                                                              spacing: CalendarMonthLayout.columnSpacing,
                                                              displayScale: displayScale)
                XCTAssertEqual(widths.count, 7, "[calendar-defects #G3-dev] \(screenWidth)")
                let spread = (widths.max() ?? 0) - (widths.min() ?? 0)
                XCTAssertLessThanOrEqual(spread, 1 / displayScale + 1e-6,
                                         "[calendar-defects #G3-dev] spread \(screenWidth)@\(displayScale)")
                for width in widths {
                    let px = width * displayScale
                    XCTAssertEqual(px, px.rounded(), accuracy: 1e-6,
                                   "[calendar-defects #G3-dev] pixel \(screenWidth)@\(displayScale)")
                }
                let consumed = widths.reduce(0, +) + CalendarMonthLayout.columnSpacing * 6
                XCTAssertLessThanOrEqual(consumed, totalWidth + 1e-6,
                                         "[calendar-defects #G3-dev] overflow \(screenWidth)@\(displayScale)")
                // 丸め損失は 7px 未満 (= 1px/列 以内)
                XCTAssertGreaterThanOrEqual(consumed, totalWidth - 7 / displayScale,
                                            "[calendar-defects #G3-dev] underflow \(screenWidth)@\(displayScale)")
            }
        }
    }

    /// [calendar-defects #G4] 親を溢れない
    func testG4ColumnWidthsNeverOverflowParent() {
        for totalWidth in [CGFloat(320), 333, 345, 361, 375, 392, 408] {
            for spacing in [CGFloat(0), 1, 2, 3] {
                for displayScale in [CGFloat(2), 3] {
                    let widths = CalendarMonthLayout.columnWidths(totalWidth: totalWidth,
                                                                  columns: 7,
                                                                  spacing: spacing,
                                                                  displayScale: displayScale)
                    XCTAssertLessThanOrEqual(widths.reduce(0, +) + spacing * 6, totalWidth + 1e-6,
                                             "[calendar-defects #G4] w=\(totalWidth) sp=\(spacing) s=\(displayScale)")
                    for width in widths {
                        XCTAssertGreaterThanOrEqual(width, 0, "[calendar-defects #G4] negative width")
                    }
                }
            }
        }
    }

    /// [calendar-defects #G5] 不正な totalWidth は 0 埋め (要素数は columns のまま)
    func testG5InvalidTotalWidthYieldsZeros() {
        for totalWidth in [CGFloat(0), -10, .infinity, .nan] {
            let widths = CalendarMonthLayout.columnWidths(totalWidth: totalWidth,
                                                          columns: 7,
                                                          spacing: 2,
                                                          displayScale: 3)
            XCTAssertEqual(widths.count, 7, "[calendar-defects #G5] \(totalWidth)")
            XCTAssertTrue(widths.allSatisfy { $0 == 0 }, "[calendar-defects #G5] \(totalWidth) -> \(widths)")
        }
    }

    /// [calendar-defects #G6] columns = 0 → 空配列 (クラッシュしない)
    func testG6ZeroColumnsReturnsEmpty() {
        XCTAssertTrue(CalendarMonthLayout.columnWidths(totalWidth: 345, columns: 0, spacing: 2, displayScale: 3).isEmpty,
                      "[calendar-defects #G6]")
        XCTAssertTrue(CalendarMonthLayout.columnWidths(totalWidth: 345, columns: -1, spacing: 2, displayScale: 3).isEmpty,
                      "[calendar-defects #G6] negative")
    }

    /// [calendar-defects #G7] displayScale = 0 → 全 0 (ゼロ除算しない)
    func testG7ZeroDisplayScaleYieldsZeros() {
        let widths = CalendarMonthLayout.columnWidths(totalWidth: 345, columns: 7, spacing: 2, displayScale: 0)

        XCTAssertEqual(widths.count, 7, "[calendar-defects #G7]")
        XCTAssertTrue(widths.allSatisfy { $0 == 0 }, "[calendar-defects #G7] \(widths)")
    }

    /// [calendar-defects #G8] spacing が totalWidth を食い尽くしても負幅を返さない
    func testG8SpacingLargerThanWidthYieldsZeros() {
        let widths = CalendarMonthLayout.columnWidths(totalWidth: 5, columns: 7, spacing: 2, displayScale: 3)

        XCTAssertEqual(widths.count, 7, "[calendar-defects #G8]")
        XCTAssertTrue(widths.allSatisfy { $0 == 0 }, "[calendar-defects #G8] \(widths)")
    }

    // ---- §9-B showsDayContent ----

    func testG9ToG13ShowsDayContentMatchesMonth() {
        XCTAssertTrue(CalendarDayStyle.showsDayContent(date: "2026-07-15", monthFirst: "2026-07-01"), "[calendar-defects #G9]")
        XCTAssertFalse(CalendarDayStyle.showsDayContent(date: "2026-06-30", monthFirst: "2026-07-01"), "[calendar-defects #G10]")
        XCTAssertFalse(CalendarDayStyle.showsDayContent(date: "2026-08-01", monthFirst: "2026-07-01"), "[calendar-defects #G11]")
        XCTAssertTrue(CalendarDayStyle.showsDayContent(date: "2026-07-01", monthFirst: "2026-07-01"), "[calendar-defects #G12]")
        XCTAssertTrue(CalendarDayStyle.showsDayContent(date: "2026-07-31", monthFirst: "2026-07-01"), "[calendar-defects #G13]")
    }

    func testG14ShowsDayContentHandlesUnparsableDate() {
        XCTAssertFalse(CalendarDayStyle.showsDayContent(date: "", monthFirst: "2026-07-01"), "[calendar-defects #G14]")
        XCTAssertFalse(CalendarDayStyle.showsDayContent(date: "not-a-date", monthFirst: "2026-07-01"), "[calendar-defects #G14]")
    }

    // ---- §9-C 行高・定数 ----

    func testG15MinRowHeightIs70() {
        XCTAssertEqual(CalendarMonthLayout.minRowHeight, 70, accuracy: 1e-6, "[calendar-defects #G15]")
    }

    func testG16GridConstants() {
        XCTAssertEqual(CalendarMonthLayout.rowSpacing, 0, accuracy: 1e-6, "[calendar-defects #G16]")
        XCTAssertEqual(CalendarMonthLayout.columnSpacing, Space.s0_5, accuracy: 1e-6, "[calendar-defects #G16]")
        XCTAssertEqual(CalendarMonthLayout.columnSpacing, 2, accuracy: 1e-6, "[calendar-defects #G16] Space.s0_5 == 2")
        XCTAssertEqual(CalendarMonthLayout.columnCount, 7, "[calendar-defects #G16]")
    }

    func testG17ToG20FormulasUnchanged() {
        XCTAssertEqual(CalendarMonthLayout.rowHeight(available: 700), (700 - 26) / 6, accuracy: 0.001, "[calendar-defects #G17]")
        XCTAssertEqual(CalendarMonthLayout.rowHeight(available: 300), CalendarMonthLayout.minRowHeight, accuracy: 0.001, "[calendar-defects #G18]")
        XCTAssertEqual(CalendarMonthLayout.contentHeight(available: 700),
                       26 + CalendarMonthLayout.rowHeight(available: 700) * 6,
                       accuracy: 0.001,
                       "[calendar-defects #G19]")
        XCTAssertEqual(CalendarMonthLayout.gridAvailable(available: 600), 584, accuracy: 0.001, "[calendar-defects #G20]")
    }

    /// [calendar-defects #G15-b] 70pt の内訳 (縦 padding 2*2 + 数字 24 + 2 + ドット 6 + 3 + chip 14 + 3 + chip 14)
    func testG15bMinRowHeightBreakdown() {
        let breakdown: CGFloat = 2 * 2 + 24 + 2 + 6 + 3 + 14 + 3 + 14
        XCTAssertEqual(CalendarMonthLayout.minRowHeight, breakdown, accuracy: 1e-6, "[calendar-defects #G15-b]")
    }
}
