enum TimetableCarryOver {
    static let defaultDaysOfWeek: [Int] = [1, 2, 3, 4, 5]

    /// 対象より前の、時間割を持つ最新の学期を引継ぎ元にする。
    static func previousTimetable(target: SemesterDto, semesters: [SemesterDto], timetables: [UserTimetableDto]) -> UserTimetableDto? {
        let candidates = semesters.filter { semester in
            semester.startDate < target.startDate && timetables.contains { $0.semesterId == semester.id }
        }.sorted { lhs, rhs in
            if lhs.startDate != rhs.startDate { return lhs.startDate > rhs.startDate }
            if lhs.endDate != rhs.endDate { return lhs.endDate > rhs.endDate }
            return lhs.id < rhs.id
        }
        guard let previous = candidates.first else { return nil }
        return timetables.first { $0.semesterId == previous.id }
    }

    /// 引継ぎ元が無い場合や時限が空の場合は既定の時限を使う。
    static func inheritedSlots(from previous: UserTimetableDto?, fallback: [DaySlotDto]) -> [DaySlotDto] {
        guard let previous, !previous.daySlots.isEmpty else { return fallback }
        return previous.daySlots
    }

    /// 引継ぎ元が無い場合や表示曜日が空の場合は平日を使う。
    static func inheritedDaysOfWeek(from previous: UserTimetableDto?) -> [Int] {
        guard let previous, !previous.daysOfWeek.isEmpty else { return defaultDaysOfWeek }
        return previous.daysOfWeek
    }
}
