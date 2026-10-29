import CoreGraphics

enum TimetableGridLayout {
    /// A timetable row must not be smaller than the iOS minimum tap target.
    static let minRowHeight: CGFloat = 44
    static let headerHeight: CGFloat = 28

    /// 1 限の行高は「画面に 7.5 行入る高さ」で固定する (行数に依存させない)。
    /// 個人 (8 限 = 画面高/8) とルーム (7 限 = 画面高/7) の中間。2 経路で同じ高さを保証する。
    static let visibleRowCount: CGFloat = 7.5

    static func rowHeight(available: CGFloat, rowCount: Int) -> CGFloat {
        rowCount <= 0 ? minRowHeight : max(minRowHeight, (available - headerHeight) / visibleRowCount)
    }

    static func contentHeight(available: CGFloat, rowCount: Int) -> CGFloat {
        headerHeight + rowHeight(available: available, rowCount: rowCount) * CGFloat(rowCount)
    }

    static func currentPeriodIndex(daySlots: [DaySlotDto], nowMinute: Int) -> Int? {
        daySlots
            .sorted { $0.periodIndex < $1.periodIndex }
            .first { $0.startMinute <= nowMinute && nowMinute < $0.endMinute }?
            .periodIndex
    }
}
