import Foundation

/// 授業 occurrence → ExportItem (§5.2、純関数)
enum CourseExportMapping {
    static func items(
        occurrences: [OccurrenceDto],
        courseSuspensions: [CourseSuspensionDto],
        timetableSuspensions: [TimetableSuspensionDto]
    ) -> [ExportItem] {
        let suspendedDates = Set(timetableSuspensions.map(\.date))
        let suspendedCourseDays = Set(courseSuspensions.map { "\($0.courseId)|\($0.date)" })

        let kept = occurrences.filter { occurrence in
            if suspendedDates.contains(occurrence.date) { return false }
            if suspendedCourseDays.contains("\(occurrence.courseId)|\(occurrence.date)") { return false }
            if occurrence.status == .cancelled { return false }
            if occurrence.endMinute <= occurrence.startMinute { return false }
            return true
        }

        // (meetingId, date) でグループ化。グループの出現順を保って決定的にする
        var groupOrder: [String] = []
        var groups: [String: [OccurrenceDto]] = [:]
        for occurrence in kept {
            let groupKey = "\(occurrence.meetingId)|\(occurrence.date)"
            if groups[groupKey] == nil {
                groups[groupKey] = []
                groupOrder.append(groupKey)
            }
            groups[groupKey]?.append(occurrence)
        }

        var out: [ExportItem] = []
        for groupKey in groupOrder {
            guard let members = groups[groupKey], let sample = members.first else { continue }
            let byPeriod = Dictionary(grouping: members, by: { $0.periodIndex })
            for run in PeriodGrouping.groupPeriods(members.map(\.periodIndex)) {
                let periods = Array(run.start..<(run.start + run.count))
                let inRun = periods.flatMap { byPeriod[$0] ?? [] }
                guard !inRun.isEmpty else { continue }
                guard let startMinute = inRun.map(\.startMinute).min(),
                      let endMinute = inRun.map(\.endMinute).max(),
                      let firstPeriodOffset = inRun.map(\.periodOffset).min() else { continue }
                let dayStart = EventKitTimeMapping.jstDayStart(sample.date)
                out.append(ExportItem(
                    key: ExportKey.meeting(meetingId: sample.meetingId, date: sample.date, firstPeriodOffset: firstPeriodOffset),
                    title: sample.courseName,
                    start: dayStart.addingTimeInterval(TimeInterval(startMinute * 60)),
                    end: dayStart.addingTimeInterval(TimeInterval(endMinute * 60)),
                    isAllDay: false,
                    location: normalized(sample.room),
                    notes: notes(periodStart: run.start, periodCount: run.count, teacher: sample.teacher)
                ))
            }
        }

        return out.sorted { lhs, rhs in
            if lhs.start != rhs.start { return lhs.start < rhs.start }
            return lhs.key < rhs.key
        }
    }

    private static func notes(periodStart: Int, periodCount: Int, teacher: String?) -> String? {
        var lines: [String] = []
        if periodCount <= 1 {
            lines.append("\(periodStart)限")
        } else {
            lines.append("\(periodStart)-\(periodStart + periodCount - 1)限")
        }
        if let teacher = normalized(teacher) {
            lines.append("担当: \(teacher)")
        }
        return lines.isEmpty ? nil : lines.joined(separator: "\n")
    }

    private static func normalized(_ value: String?) -> String? {
        guard let value else { return nil }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
