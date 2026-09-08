enum CalendarWindow {
    static let radiusMonths: Int = 24

    /// §4.4: origin を中心に、月初へ正規化した ±radius ヶ月の窓を昇順で返す。
    static func months(origin: String, radius: Int = radiusMonths) -> [String] {
        let normalizedOrigin = CalendarRange.monthFirst(origin)
        let safeRadius = max(0, radius)
        return (-safeRadius...safeRadius).map { offset in
            CalendarRange.monthFirst(CalendarRange.addMonths(normalizedOrigin, offset))
        }
    }

    /// §4.4: date を月初へ正規化して、固定窓に含まれるかだけを判定する。
    static func contains(_ monthFirst: String, origin: String, radius: Int = radiusMonths) -> Bool {
        let normalizedMonth = CalendarRange.monthFirst(monthFirst)
        return months(origin: origin, radius: radius).contains(normalizedMonth)
    }

    /// §4.4: ヘッダーの chevron は窓外へ進ませない。nil が disabled の根拠になる。
    static func step(from: String, by months: Int, origin: String, radius: Int = radiusMonths) -> String? {
        let destination = CalendarRange.monthFirst(CalendarRange.addMonths(CalendarRange.monthFirst(from), months))
        return contains(destination, origin: origin, radius: radius) ? destination : nil
    }

    /// §3.5: 先読みは前後 1 ヶ月だけ。窓外はここで除外して呼び出し側を単純に保つ。
    static func neighbors(of monthFirst: String, origin: String, radius: Int = radiusMonths) -> [String] {
        [-1, 1].compactMap { step(from: monthFirst, by: $0, origin: origin, radius: radius) }.sorted()
    }
}
