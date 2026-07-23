import CoreGraphics

enum CalendarMonthLayout {
    // 24pt day-number row + 3pt gap + two caption chips at about 13pt each + 3pt chip gap + 4pt cell padding.
    static let minRowHeight: CGFloat = 60
    static let weekdayHeaderHeight: CGFloat = 26
    static let rowCount: Int = 6

    static func rowHeight(available: CGFloat) -> CGFloat {
        max(minRowHeight, (available - weekdayHeaderHeight) / CGFloat(rowCount))
    }

    static func contentHeight(available: CGFloat) -> CGFloat {
        weekdayHeaderHeight + rowHeight(available: available) * CGFloat(rowCount)
    }
}

enum CalendarDayEmphasis: Equatable {
    case selected
    case today
    case outsideMonth
    case normal
}

enum CalendarDayStyle {
    /// Priority: selected > today > outsideMonth > normal.
    static func emphasis(date: String, todayString: String, selectedDate: String, monthFirst: String) -> CalendarDayEmphasis {
        if date == selectedDate { return .selected }
        if date == todayString { return .today }
        if CalendarRange.monthFirst(date) != monthFirst { return .outsideMonth }
        return .normal
    }
}
