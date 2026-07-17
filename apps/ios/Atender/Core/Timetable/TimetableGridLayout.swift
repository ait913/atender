import CoreGraphics

enum TimetableGridLayout {
    /// A timetable row must not be smaller than the iOS minimum tap target.
    static let minRowHeight: CGFloat = 44
    static let headerHeight: CGFloat = 28

    static func rowHeight(available: CGFloat, rowCount: Int) -> CGFloat {
        rowCount <= 0 ? minRowHeight : max(minRowHeight, (available - headerHeight) / CGFloat(rowCount))
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
