import Foundation

struct SemesterProposal: Equatable {
    let name: String
    let startDate: String
    let endDate: String
}

enum SemesterRollover {
    static func latest(_ semesters: [SemesterDto]) -> SemesterDto? {
        semesters.sorted {
            if $0.startDate != $1.startDate { return $0.startDate > $1.startDate }
            if $0.endDate != $1.endDate { return $0.endDate > $1.endDate }
            return $0.id < $1.id
        }.first
    }

    static func allEnded(_ semesters: [SemesterDto], today: String) -> Bool {
        !semesters.isEmpty && semesters.allSatisfy { $0.endDate < today }
    }

    static func promptTarget(semesters: [SemesterDto], today: String, dismissedSemesterId: String?) -> SemesterDto? {
        guard allEnded(semesters, today: today),
              let previous = latest(semesters), previous.id != dismissedSemesterId else { return nil }
        return previous
    }

    static func proposal(after previous: SemesterDto, today: String) -> SemesterProposal {
        var start = CalendarRange.addDays(previous.endDate, 1)
        var end = CalendarRange.addDays(CalendarRange.addMonths(start, 6), -1)
        if end < today {
            start = CalendarRange.monthFirst(today)
            end = CalendarRange.addDays(CalendarRange.addMonths(start, 6), -1)
        }
        let year = String(start.prefix(4))
        let month = Int(start.dropFirst(5).prefix(2)) ?? 0
        let term = (4...9).contains(month) ? "前期" : "後期"
        return SemesterProposal(name: "\(year) \(term)", startDate: start, endDate: end)
    }

    static func alertMessage(previous: SemesterDto) -> String {
        "「\(previous.name)」は \(CalendarRange.format(previous.endDate, .yearMonthDay)) に終了しました。新しい学期を作成しますか?"
    }

    static func canCreate(name: String, startDate: String, endDate: String) -> Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && startDate <= endDate
    }
}

struct SemesterRolloverStore {
    static let key = "atender.semesterRollover.dismissedSemesterId"
    var defaults: UserDefaults = .standard

    var dismissedSemesterId: String? {
        get { defaults.string(forKey: Self.key) }
        nonmutating set {
            if let newValue {
                defaults.set(newValue, forKey: Self.key)
            } else {
                defaults.removeObject(forKey: Self.key)
            }
        }
    }
}
