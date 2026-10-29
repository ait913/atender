import Foundation

enum RoomTimetableLogic {
    static let defaultSlots: [DaySlotDto] = [
        DaySlotDto(periodIndex: 1, label: "1限", startMinute: 540, endMinute: 630, isBreak: false),
        DaySlotDto(periodIndex: 2, label: "2限", startMinute: 640, endMinute: 730, isBreak: false),
        DaySlotDto(periodIndex: 3, label: "3限", startMinute: 780, endMinute: 870, isBreak: false),
        DaySlotDto(periodIndex: 4, label: "4限", startMinute: 880, endMinute: 970, isBreak: false),
        DaySlotDto(periodIndex: 5, label: "5限", startMinute: 980, endMinute: 1070, isBreak: false),
    ]

    static func resolveDaySlots(preferredSemesterId: String? = nil,
                                defaultSemesterId: String?,
                                timetables: [UserTimetableDto]) -> [DaySlotDto] {
        // §4.8: ルームでも画面上の学期文脈を先に見る。無い場合は従来の既定学期へ戻す。
        let preferred = preferredSemesterId.flatMap { id in timetables.first { $0.semesterId == id } }
        let fallback = defaultSemesterId.flatMap { id in timetables.first { $0.semesterId == id } }
        let timetable = preferred ?? fallback ?? timetables.first
        return timetable?.daySlots.isEmpty == false ? timetable!.daySlots : defaultSlots
    }

    static func buildRecurringEvents(week: RoomWeekDto) -> [TimetableEventInput] {
        let members = Dictionary(uniqueKeysWithValues: week.members.map { ($0.userId, $0) })
        var seen = Set<String>()
        var events: [TimetableEventInput] = []
        for recurringMeeting in week.recurringMeetings {
            let dow = DayConvention.jsToDisplay(recurringMeeting.dayOfWeek)
            let key = "\(recurringMeeting.userId):\(recurringMeeting.courseId):\(dow):\(recurringMeeting.startPeriodIndex)"
            guard seen.insert(key).inserted else { continue }
            let member = members[recurringMeeting.userId]
            events.append(TimetableEventInput(
                id: key,
                dayOfWeek: dow,
                startPeriodIndex: recurringMeeting.startPeriodIndex,
                periodCount: max(1, recurringMeeting.periodCount),
                color: recurringMeeting.courseColor ?? member?.color ?? "#F97316",
                title: recurringMeeting.courseName,
                subtitle: memberName(name: member?.name, handle: member?.handle),
                mergeKey: "\(recurringMeeting.userId):\(recurringMeeting.courseId)"
            ))
        }
        return events.sorted {
            if $0.dayOfWeek != $1.dayOfWeek { return $0.dayOfWeek < $1.dayOfWeek }
            return $0.startPeriodIndex < $1.startPeriodIndex
        }
    }

    private static func memberName(name: String?, handle: String?) -> String {
        if let name, !name.isEmpty { return name }
        if let handle, !handle.isEmpty { return handle }
        return "No name"
    }

    static func displayDays(events: [TimetableEventInput]) -> [Int] {
        Array(Set([1, 2, 3, 4, 5] + events.map(\.dayOfWeek))).sorted()
    }
}

enum RoomInviteCode {
    static func parse(_ raw: String) -> String {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.split(separator: "/").last.map(String.init) ?? trimmed
    }
}
