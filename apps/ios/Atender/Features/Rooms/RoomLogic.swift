import Foundation

enum RoomCalendarLogic {
    static func buildCalendarEvents(weeks: [RoomWeekDto]) -> [CalendarEvent] {
        var seenMeetings = Set<String>()
        var seenRoomEvents = Set<String>()
        var events: [CalendarEvent] = []

        for week in weeks {
            let members = Dictionary(uniqueKeysWithValues: week.members.map { ($0.userId, $0) })
            for meeting in week.meetings where seenMeetings.insert(meeting.occurrenceId).inserted {
                let member = members[meeting.userId]
                let name = memberName(name: member?.name, handle: member?.handle)
                events.append(CalendarEvent(
                    kind: .meeting,
                    id: "meeting:\(meeting.occurrenceId)",
                    date: meeting.date,
                    title: meeting.courseName,
                    startMinute: Int(meeting.startMinute),
                    endMinute: Int(meeting.endMinute),
                    color: meeting.courseColor ?? member?.color ?? MemberColor.memberColor(meeting.userId),
                    subtitle: name,
                    courseId: meeting.courseId,
                    ownerId: meeting.userId
                ))
            }

            for roomEvent in week.roomEvents {
                let key = "\(roomEvent.seriesId):\(roomEvent.occurrenceDate)"
                guard seenRoomEvents.insert(key).inserted else { continue }
                let author = members[roomEvent.authorId]
                let authorColor = author?.color ?? MemberColor.memberColor(roomEvent.authorId)
                let timing = RoomEventTiming.timing(startISO: roomEvent.start, endISO: roomEvent.end)
                events.append(CalendarEvent(
                    kind: .roomEvent,
                    id: "room:\(roomEvent.seriesId):\(roomEvent.occurrenceDate)",
                    date: timing.date,
                    title: roomEvent.title,
                    startMinute: timing.startMinute,
                    endMinute: timing.endMinute,
                    color: sourceColor(roomEvent.source, authorColor: authorColor),
                    subtitle: memberName(name: author?.name, handle: author?.handle),
                    courseId: nil,
                    ownerId: roomEvent.authorId,
                    source: roomEvent.source
                ))
            }
        }

        return events.sorted {
            if $0.date != $1.date { return $0.date < $1.date }
            if $0.startMinute != $1.startMinute { return $0.startMinute < $1.startMinute }
            return $0.id < $1.id
        }
    }

    static func sourceColor(_ source: RoomEventSource, authorColor: String) -> String {
        switch source {
        case .googleOauth:
            return "#38bdf8"
        case .icsFile, .icsUrl:
            return "#94a3b8"
        case .manual, .unknown:
            return authorColor
        }
    }

    static func memberName(name: String?, handle: String?) -> String {
        if let name, !name.isEmpty { return name }
        if let handle, !handle.isEmpty { return handle }
        return "No name"
    }
}

enum RoomEventTiming {
    private static let jst = TimeZone(identifier: "Asia/Tokyo")!

    static func timing(startISO: String, endISO: String) -> (date: String, startMinute: Int, endMinute: Int) {
        let start = parseISO(startISO) ?? Date()
        let end = parseISO(endISO) ?? start
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = jst
        let s = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: start)
        let e = calendar.dateComponents([.hour, .minute], from: end)
        let date = String(format: "%04d-%02d-%02d", s.year ?? 1970, s.month ?? 1, s.day ?? 1)
        return (date, (s.hour ?? 0) * 60 + (s.minute ?? 0), (e.hour ?? 0) * 60 + (e.minute ?? 0))
    }

    static func format(_ iso: String, pattern: String) -> String {
        guard let date = parseISO(iso) else { return iso }
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = jst
        formatter.locale = Locale(identifier: "ja_JP")
        formatter.dateFormat = pattern
        return formatter.string(from: date)
    }

    private static func parseISO(_ value: String) -> Date? {
        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let isoFormatterNoFraction = ISO8601DateFormatter()
        isoFormatterNoFraction.formatOptions = [.withInternetDateTime]
        return isoFormatter.date(from: value) ?? isoFormatterNoFraction.date(from: value)
    }
}

enum RoomAvailability {
    struct Result: Equatable {
        let combined: [Int]
        let perMember: [(userId: String, busy: [Bool])]

        static func == (lhs: Result, rhs: Result) -> Bool {
            lhs.combined == rhs.combined
                && lhs.perMember.count == rhs.perMember.count
                && zip(lhs.perMember, rhs.perMember).allSatisfy { $0.userId == $1.userId && $0.busy == $1.busy }
        }
    }

    static let slotStartMin = 540
    static let slotEndMin = 1080
    static let slotStep = 30

    static func compute(members: [RoomWeekDto.Member], events: [CalendarEvent]) -> Result {
        let slots = Array(stride(from: slotStartMin, to: slotEndMin, by: slotStep))
        let perMember = members.map { member in
            let busy = slots.map { slotStart in
                let slotEnd = slotStart + slotStep
                return events.contains { event in
                    event.ownerId == member.userId && event.startMinute < slotEnd && event.endMinute > slotStart
                }
            }
            return (userId: member.userId, busy: busy)
        }
        let combined = slots.indices.map { index in
            perMember.reduce(0) { $0 + ($1.busy[index] ? 1 : 0) }
        }
        return .init(combined: combined, perMember: perMember)
    }
}

enum RoomTimetableLogic {
    static let defaultSlots: [DaySlotDto] = [
        DaySlotDto(periodIndex: 1, label: "1限", startMinute: 540, endMinute: 630, isBreak: false),
        DaySlotDto(periodIndex: 2, label: "2限", startMinute: 640, endMinute: 730, isBreak: false),
        DaySlotDto(periodIndex: 3, label: "3限", startMinute: 780, endMinute: 870, isBreak: false),
        DaySlotDto(periodIndex: 4, label: "4限", startMinute: 880, endMinute: 970, isBreak: false),
        DaySlotDto(periodIndex: 5, label: "5限", startMinute: 980, endMinute: 1070, isBreak: false),
    ]

    static func resolveDaySlots(defaultSemesterId: String?, timetables: [UserTimetableDto]) -> [DaySlotDto] {
        let timetable = timetables.first { $0.semesterId == defaultSemesterId } ?? timetables.first
        return timetable?.daySlots.isEmpty == false ? timetable!.daySlots : defaultSlots
    }

    static func buildEvents(week: RoomWeekDto, daySlots: [DaySlotDto]) -> [TimetableEventInput] {
        let members = Dictionary(uniqueKeysWithValues: week.members.map { ($0.userId, $0) })
        let sortedSlots = daySlots.sorted { $0.periodIndex < $1.periodIndex }
        var seen = Set<String>()
        var events: [TimetableEventInput] = []
        for meeting in week.meetings {
            guard let date = CalendarRange.parse(meeting.date) else { continue }
            let jsDay = CalendarRange.utcCalendar.component(.weekday, from: date) - 1
            let dow = DayConvention.jsToDisplay(jsDay)
            let startMinute = Int(meeting.startMinute)
            let endMinute = Int(meeting.endMinute)
            guard let slot = sortedSlots.first(where: { startMinute >= $0.startMinute && startMinute < $0.endMinute })
                ?? sortedSlots.first(where: { startMinute < $0.endMinute })
            else { continue }
            let key = "\(meeting.userId):\(meeting.courseId):\(dow):\(slot.periodIndex)"
            guard seen.insert(key).inserted else { continue }
            let span = max(1, sortedSlots.filter { $0.periodIndex >= slot.periodIndex && $0.startMinute < endMinute }.count)
            let member = members[meeting.userId]
            events.append(TimetableEventInput(
                id: key,
                dayOfWeek: dow,
                startPeriodIndex: slot.periodIndex,
                periodCount: span,
                color: meeting.courseColor ?? member?.color ?? "#F97316",
                title: meeting.courseName,
                subtitle: RoomCalendarLogic.memberName(name: member?.name, handle: member?.handle),
                mergeKey: "\(meeting.userId):\(meeting.courseId)"
            ))
        }
        return events.sorted {
            if $0.dayOfWeek != $1.dayOfWeek { return $0.dayOfWeek < $1.dayOfWeek }
            return $0.startPeriodIndex < $1.startPeriodIndex
        }
    }

    static func displayDays(events: [TimetableEventInput]) -> [Int] {
        Array(Set([1, 2, 3, 4, 5] + events.map(\.dayOfWeek))).sorted()
    }
}

enum RecurrencePresetLogic {
    private static let weekdays = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"]
    private static let weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"]

    static func presetToRRule(_ preset: String, start: Date) -> String? {
        let c = CalendarRange.utcCalendar
        let weekday = c.component(.weekday, from: start) - 1
        let day = c.component(.day, from: start)
        let month = c.component(.month, from: start)
        let ordinal = ((day - 1) / 7) + 1
        switch preset {
        case "daily": return "FREQ=DAILY"
        case "weekly": return "FREQ=WEEKLY;BYDAY=\(weekdays[weekday])"
        case "weekday": return "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"
        case "monthly_bymonthday": return "FREQ=MONTHLY;BYMONTHDAY=\(day)"
        case "monthly_byday": return "FREQ=MONTHLY;BYDAY=\(ordinal)\(weekdays[weekday])"
        case "yearly": return "FREQ=YEARLY;BYMONTH=\(month);BYMONTHDAY=\(day)"
        default: return nil
        }
    }

    static func recurrenceToText(_ rrule: String?, start: Date?) -> String {
        guard let rrule, !rrule.isEmpty else { return "繰り返しなし" }
        if rrule == "FREQ=DAILY" { return "毎日" }
        if rrule == "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" { return "平日のみ" }
        if let start {
            return presetLabel(currentPreset(rrule, start: start), start: start)
        }
        return rrule
    }

    static func currentPreset(_ rrule: String?, start: Date) -> String {
        guard let rrule else { return "none" }
        for preset in ["daily", "weekly", "weekday", "monthly_bymonthday", "monthly_byday", "yearly"] {
            if presetToRRule(preset, start: start) == rrule { return preset }
        }
        return "none"
    }

    static func presetLabel(_ preset: String, start: Date) -> String {
        let c = CalendarRange.utcCalendar
        let weekday = c.component(.weekday, from: start) - 1
        let day = c.component(.day, from: start)
        let month = c.component(.month, from: start)
        let ordinal = ((day - 1) / 7) + 1
        switch preset {
        case "daily": return "毎日"
        case "weekly": return "毎週\(weekdayLabels[weekday])曜日"
        case "weekday": return "平日のみ"
        case "monthly_bymonthday": return "毎月\(day)日"
        case "monthly_byday": return "毎月第\(ordinal)\(weekdayLabels[weekday])曜日"
        case "yearly": return "毎年\(month)月\(day)日"
        default: return "繰り返しなし"
        }
    }
}

enum RoomInviteCode {
    static func parse(_ raw: String) -> String {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.split(separator: "/").last.map(String.init) ?? trimmed
    }
}

enum RoomCardLogic {
    static func upcomingLabel(start: String, title: String) -> String {
        let compact = start.replacingOccurrences(of: "T", with: " ")
        let label = compact.count >= 16 ? String(compact.dropFirst(5).prefix(11)) : compact
        return "\(label) · \(title)"
    }
}

enum TemplateLogic {
    static func authorHandle(_ t: TemplateDto) -> String {
        t.authorUserId
    }
}
