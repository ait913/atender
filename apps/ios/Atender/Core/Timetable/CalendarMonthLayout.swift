import CoreGraphics

enum CalendarMonthLayout {
    // 縦 padding 2*2 + 日付丸 24 + 2 + ドット 6 + 3 + chip 14 + 3 + chip 14 = 70
    static let minRowHeight: CGFloat = 70
    static let weekdayHeaderHeight: CGFloat = 26
    static let rowCount: Int = 6
    static let columnCount: Int = 7
    static let columnSpacing: CGFloat = Space.s0_5
    /// 行間 gap は置かない (rowHeight / contentHeight の式を不変に保つため)
    static let rowSpacing: CGFloat = 0

    static func rowHeight(available: CGFloat) -> CGFloat {
        max(minRowHeight, (available - weekdayHeaderHeight) / CGFloat(rowCount))
    }

    /// card chrome (Space.s2 の上下 padding) ぶんを差し引いた、グリッドに使える高さ
    static let cardChromeHeight: CGFloat = 8 * 2

    static func gridAvailable(available: CGFloat) -> CGFloat { max(0, available - cardChromeHeight) }

    static func contentHeight(available: CGFloat) -> CGFloat {
        weekdayHeaderHeight + rowHeight(available: available) * CGFloat(rowCount)
    }

    /// device pixel に丸めた等幅列。余り px は先頭列から 1px ずつ配る。
    /// 返り値の要素数は必ず `columns`。合計 + spacing*(columns-1) <= totalWidth。
    static func columnWidths(totalWidth: CGFloat,
                             columns: Int = columnCount,
                             spacing: CGFloat = columnSpacing,
                             displayScale: CGFloat) -> [CGFloat] {
        guard columns > 0 else { return [] }
        guard totalWidth.isFinite, totalWidth > 0, displayScale > 0 else {
            return Array(repeating: 0, count: columns)
        }
        let content = max(0, totalWidth - spacing * CGFloat(columns - 1))
        let totalPx = Int((content * displayScale).rounded(.down))
        let base = totalPx / columns
        let remainder = totalPx % columns
        return (0..<columns).map { index in
            CGFloat(base + (index < remainder ? 1 : 0)) / displayScale
        }
    }
}

enum CalendarDayEmphasis: Equatable {
    case today
    case outsideMonth
    case normal
}

enum CalendarDayStyle {
    /// 日付数字の見せ方。Priority: today > outsideMonth > normal
    static func emphasis(date: String, todayString: String, monthFirst: String) -> CalendarDayEmphasis {
        if date == todayString { return .today }
        if CalendarRange.monthFirst(date) != monthFirst { return .outsideMonth }
        return .normal
    }

    /// セル全高のグレー塗りを敷くか。当月内外を問わない。
    static func isSelected(date: String, selectedDate: String) -> Bool {
        !date.isEmpty && date == selectedDate
    }

    /// 当月外の日はイベント chip / ステータスドットを描かない (Web `CalendarMonth` と同一規則)
    static func showsDayContent(date: String, monthFirst: String) -> Bool {
        CalendarRange.monthFirst(date) == monthFirst
    }
}
