import XCTest
@testable import Atender

/// build 17 設計 §6.3 (#B14-#B20) — 月の窓の純関数。
/// 設計docのみを根拠に記述 (実装は未読)。
final class B17CalendarWindowTests: XCTestCase {

    private let origin = "2026-07-01"

    /// [#B14] ±24ヶ月 = 49 要素 / 端 / 昇順 / 重複なし / 形式
    func testB14MonthsWindowShape() {
        let months = CalendarWindow.months(origin: origin)
        XCTAssertEqual(months.count, 49, "[#B14] 要素数が 2*24+1 でない")
        XCTAssertEqual(months.first, "2024-07-01", "[#B14] 先頭が origin-24ヶ月でない")
        XCTAssertEqual(months.last, "2028-07-01", "[#B14] 末尾が origin+24ヶ月でない")
        XCTAssertEqual(months, months.sorted(), "[#B14] 昇順でない")
        XCTAssertEqual(Set(months).count, months.count, "[#B14] 重複がある")
        for month in months {
            XCTAssertEqual(month.count, 10, "[#B14] 形式が yyyy-MM-01 でない: \(month)")
            XCTAssertTrue(month.hasSuffix("-01"), "[#B14] 月初でない: \(month)")
            let parts = month.split(separator: "-")
            XCTAssertEqual(parts.count, 3, "[#B14] 区切りが不正: \(month)")
            XCTAssertNotNil(Int(parts[0]), "[#B14] 年が数値でない: \(month)")
            let monthNumber = Int(parts[1])
            XCTAssertNotNil(monthNumber, "[#B14] 月が数値でない: \(month)")
            XCTAssertTrue((1...12).contains(monthNumber ?? 0), "[#B14] 月が範囲外: \(month)")
        }
        XCTAssertTrue(months.contains(origin), "[#B14] origin 自身が窓に無い")
    }

    /// [#B15] origin は月に正規化される
    func testB15OriginIsNormalizedToMonthFirst() {
        XCTAssertEqual(CalendarWindow.months(origin: "2026-07-15"),
                       CalendarWindow.months(origin: "2026-07-01"),
                       "[#B15] origin が月初へ正規化されていない")
    }

    /// [#B16] contains の内外判定
    func testB16Contains() {
        XCTAssertTrue(CalendarWindow.contains("2026-07-01", origin: origin), "[#B16] origin 自身が含まれない")
        XCTAssertFalse(CalendarWindow.contains("2024-06-01", origin: origin), "[#B16] 窓の手前が含まれてしまう")
        XCTAssertFalse(CalendarWindow.contains("2028-08-01", origin: origin), "[#B16] 窓の先が含まれてしまう")
        XCTAssertTrue(CalendarWindow.contains("2024-07-01", origin: origin), "[#B16] 下端が含まれない")
        XCTAssertTrue(CalendarWindow.contains("2028-07-01", origin: origin), "[#B16] 上端が含まれない")
    }

    /// [#B17] step は窓外で nil
    func testB17StepStopsAtWindowEdges() {
        XCTAssertEqual(CalendarWindow.step(from: "2026-07-01", by: 1, origin: origin), "2026-08-01", "[#B17] +1 が次月でない")
        XCTAssertNil(CalendarWindow.step(from: "2028-07-01", by: 1, origin: origin), "[#B17] 上端の先へ進めてしまう")
        XCTAssertNil(CalendarWindow.step(from: "2024-07-01", by: -1, origin: origin), "[#B17] 下端の手前へ戻れてしまう")
        XCTAssertEqual(CalendarWindow.step(from: "2026-07-01", by: -1, origin: origin), "2026-06-01", "[#B17] -1 が前月でない")
    }

    /// [#B18] neighbors は前後1ヶ月、端では1個
    func testB18Neighbors() {
        XCTAssertEqual(CalendarWindow.neighbors(of: "2026-07-01", origin: origin),
                       ["2026-06-01", "2026-08-01"], "[#B18] 中央の隣接月が前後1ヶ月でない")
        XCTAssertEqual(CalendarWindow.neighbors(of: "2028-07-01", origin: origin),
                       ["2028-06-01"], "[#B18] 上端の隣接月が1個でない")
        XCTAssertEqual(CalendarWindow.neighbors(of: "2024-07-01", origin: origin),
                       ["2024-08-01"], "[#B18] 下端の隣接月が1個でない")
    }

    /// [#B19] radius 0 でクラッシュしない
    func testB19RadiusZero() {
        XCTAssertEqual(CalendarWindow.months(origin: origin, radius: 0), [origin], "[#B19] radius 0 で 1 要素にならない")
        XCTAssertEqual(CalendarWindow.neighbors(of: origin, origin: origin, radius: 0), [], "[#B19] radius 0 で隣接月が空でない")
        XCTAssertNil(CalendarWindow.step(from: origin, by: 1, origin: origin, radius: 0), "[#B19] radius 0 で step が nil でない")
        XCTAssertTrue(CalendarWindow.contains(origin, origin: origin, radius: 0), "[#B19] radius 0 で自分自身が含まれない")
    }

    /// [#B20] 年跨ぎ
    func testB20YearBoundary() {
        XCTAssertEqual(CalendarWindow.step(from: "2026-12-01", by: 1, origin: origin), "2027-01-01", "[#B20] 12月+1 が翌年1月でない")
        XCTAssertEqual(CalendarWindow.step(from: "2027-01-01", by: -1, origin: origin), "2026-12-01", "[#B20] 1月-1 が前年12月でない")
    }

    /// [#B14 補] radiusMonths 定数が 24 (設計 §4.4)
    func testB14bRadiusMonthsConstant() {
        XCTAssertEqual(CalendarWindow.radiusMonths, 24, "[#B14] radiusMonths が 24 でない")
    }
}
