import Foundation

enum ClassTransferMode: String, CaseIterable, Equatable {
    case moveDay
    case single

    var label: String {
        switch self {
        case .moveDay: return "曜日ごと"
        case .single: return "コマごと"
        }
    }
}

struct ClassTransferPreviewRow: Equatable, Identifiable {
    var id: Int { periodIndex }
    let periodIndex: Int
    let periodCount: Int              // 連続コマは 1 行 ("3-4限")
    let courseName: String
    let replaces: String?             // "月曜 3限 体育 を置き換え" / nil = 空き
    let blockedBy: String?            // "既に授業変更があります" (振替同士の衝突) / nil
}

enum ClassTransferLogic {
    private static let weekdayShortLabels = ["日", "月", "火", "水", "木", "金", "土"]
    private static let weekdayFullLabels = ["日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"]

    private static func jsWeekday(of dateString: String) -> Int? {
        guard let date = CalendarRange.parse(dateString) else { return nil }
        return CalendarRange.utcCalendar.component(.weekday, from: date) - 1
    }

    /// 表示順 (月始まり) で最初の「meetings を持ち、target と違う曜日」。無ければ nil
    static func defaultSourceDay(targetDate: String, meetings: [MeetingDto]) -> Int? {
        guard let targetJsDay = jsWeekday(of: targetDate) else { return nil }
        let daysWithMeetings = Set(meetings.map(\.dayOfWeek))
        for display in 1...7 {
            let js = DayConvention.displayToJs(display)
            if js != targetJsDay, daysWithMeetings.contains(js) {
                return js
            }
        }
        return nil
    }

    /// target より前で最も近い dow の日。semesterStart より前なら semesterStart 以後で最初の dow の日
    static func defaultSourceDate(targetDate: String, sourceDayOfWeek: Int, semesterStart: String) -> String {
        guard let targetJsDay = jsWeekday(of: targetDate) else { return targetDate }
        var diff = (targetJsDay - sourceDayOfWeek + 7) % 7
        if diff == 0 { diff = 7 }
        let candidate = CalendarRange.addDays(targetDate, -diff)
        if candidate < semesterStart {
            guard let startJsDay = jsWeekday(of: semesterStart) else { return candidate }
            let forwardDiff = (sourceDayOfWeek - startJsDay + 7) % 7
            return CalendarRange.addDays(semesterStart, forwardDiff)
        }
        return candidate
    }

    /// MOVE_DAY のプレビュー。同日の既存 occurrence から置き換え / 衝突を求める
    static func previewMoveDay(targetDate: String, sourceDayOfWeek: Int, timetable: UserTimetableDto, existing: [OccurrenceDto]) -> [ClassTransferPreviewRow] {
        let courseMap = Dictionary(uniqueKeysWithValues: timetable.courses.map { ($0.id, $0) })
        let sourceMeetings = timetable.meetings
            .filter { $0.dayOfWeek == sourceDayOfWeek }
            .sorted { $0.startPeriodIndex < $1.startPeriodIndex }
        let targetWeekday = jsWeekday(of: targetDate).map { weekdayShortLabels[$0] } ?? ""

        return sourceMeetings.map { meeting in
            let periods = Set(meeting.startPeriodIndex..<(meeting.startPeriodIndex + meeting.periodCount))
            let courseName = courseMap[meeting.courseId]?.name ?? ""

            let displacedOccurrence = existing.first { $0.transferId == nil && periods.contains($0.periodIndex) }
            let replaces = displacedOccurrence.map { "\(targetWeekday)曜 \($0.periodIndex)限 \($0.courseName) を置き換え" }

            let blocked = existing.contains { $0.transferId != nil && periods.contains($0.periodIndex) }

            return ClassTransferPreviewRow(
                periodIndex: meeting.startPeriodIndex,
                periodCount: meeting.periodCount,
                courseName: courseName,
                replaces: replaces,
                blockedBy: blocked ? "既に授業変更があります" : nil
            )
        }
    }

    /// SINGLE のプレビュー
    static func previewSingle(periodIndexes: [Int], courseId: String, timetable: UserTimetableDto, existing: [OccurrenceDto]) -> [ClassTransferPreviewRow] {
        guard !periodIndexes.isEmpty else { return [] }
        let courseName = timetable.courses.first { $0.id == courseId }?.name ?? ""
        let groups = PeriodGrouping.groupPeriods(periodIndexes)

        return groups.map { group in
            let periods = Set(group.start..<(group.start + group.count))
            let displacedOccurrence = existing.first { $0.transferId == nil && periods.contains($0.periodIndex) }
            let weekday = displacedOccurrence.flatMap { jsWeekday(of: $0.date) }.map { weekdayShortLabels[$0] } ?? ""
            let replaces = displacedOccurrence.map { "\(weekday)曜 \($0.periodIndex)限 \($0.courseName) を置き換え" }

            let blocked = existing.contains { $0.transferId != nil && periods.contains($0.periodIndex) }

            return ClassTransferPreviewRow(
                periodIndex: group.start,
                periodCount: group.count,
                courseName: courseName,
                replaces: replaces,
                blockedBy: blocked ? "既に授業変更があります" : nil
            )
        }
    }

    /// footer を押せるか: rows が空でなく、blockedBy が 1 つも無い
    static func canSubmit(_ rows: [ClassTransferPreviewRow]) -> Bool {
        !rows.isEmpty && rows.allSatisfy { $0.blockedBy == nil }
    }

    /// 「授業変更」カードの 1 行文言
    static func summary(_ transfer: ClassTransferDto, occurrences: [OccurrenceDto]) -> String {
        switch transfer.kind {
        case .moveDay:
            let dayLabel = transfer.sourceDayOfWeek.flatMap { weekdayFullLabels.indices.contains($0) ? weekdayFullLabels[$0] : nil } ?? ""
            var text = "\(dayLabel)の時間割 (\(occurrences.count)コマ)"
            if let sourceDate = transfer.sourceDate {
                let md = CalendarRange.format(sourceDate, .monthDay)
                let wd = jsWeekday(of: sourceDate).map { weekdayShortLabels[$0] } ?? ""
                text += " · \(md)(\(wd)) を休講"
            }
            return text
        case .single, .unknown:
            let courseName = occurrences.first?.courseName ?? ""
            let periods = occurrences.map(\.periodIndex).sorted()
            let groups = PeriodGrouping.groupPeriods(periods)
            let periodText = groups.map { group -> String in
                group.count == 1 ? "\(group.start)限" : "\(group.start)-\(group.start + group.count - 1)限"
            }.joined(separator: "・")
            return "\(courseName) \(periodText)"
        }
    }

    /// 削除確認が要るか (= その transfer の occurrence に status != nil がある)。記録件数。0 なら確認不要
    static func needsDeleteConfirmation(transfer: ClassTransferDto, occurrences: [OccurrenceDto]) -> Int {
        occurrences.filter { $0.transferId == transfer.id && $0.status != nil }.count
    }
}

enum TransferDisplay {
    static func displacedKeys(_ transfers: [ClassTransferDto]) -> Set<String> {
        var keys: Set<String> = []
        for transfer in transfers {
            for displaced in transfer.displaced {
                keys.insert("\(displaced.meetingId)|\(transfer.date)")
            }
        }
        return keys
    }

    static func calendarEvents(occurrences: [OccurrenceDto], courses: [CourseDto]) -> [CalendarEvent] {
        let courseMap = Dictionary(uniqueKeysWithValues: courses.map { ($0.id, $0) })
        struct GroupKey: Hashable { let transferId: String; let meetingId: String; let date: String }
        var groups: [GroupKey: [OccurrenceDto]] = [:]
        for occurrence in occurrences {
            guard let transferId = occurrence.transferId else { continue }
            let key = GroupKey(transferId: transferId, meetingId: occurrence.meetingId, date: occurrence.date)
            groups[key, default: []].append(occurrence)
        }

        var events: [CalendarEvent] = []
        for (key, group) in groups {
            let sorted = group.sorted { $0.periodIndex < $1.periodIndex }
            let periods = sorted.map(\.periodIndex)
            for run in PeriodGrouping.groupPeriods(periods) {
                let runOccurrences = sorted.filter { $0.periodIndex >= run.start && $0.periodIndex < run.start + run.count }
                guard let first = runOccurrences.first else { continue }
                let startMinute = runOccurrences.map(\.startMinute).min() ?? first.startMinute
                let endMinute = runOccurrences.map(\.endMinute).max() ?? first.endMinute
                let course = courseMap[first.courseId]
                events.append(CalendarEvent(
                    kind: .meeting,
                    id: "t:\(key.transferId):\(key.meetingId):\(key.date):\(run.start)",
                    date: key.date,
                    title: "振替 \(first.courseName)",
                    startMinute: startMinute,
                    endMinute: endMinute,
                    color: course?.color ?? MemberColor.memberColor(first.courseId),
                    subtitle: "振替",
                    courseId: first.courseId
                ))
            }
        }
        return events
    }
}
