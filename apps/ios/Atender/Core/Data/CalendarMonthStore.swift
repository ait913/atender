import Foundation
import Observation

@MainActor
@Observable
final class CalendarMonthStore<Extra> {

    struct Payload {
        var events: [CalendarEvent]
        var daySummaries: [String: AttendanceDaySummary]
        /// 文脈固有の生データ。個人 = [PersonalEventOccurrenceDto] / ルーム = [RoomWeekDto]
        var extra: Extra
    }

    struct Request: Equatable {
        let monthFirst: String
        let rangeStart: String
        let rangeEnd: String
        let semesterId: String?
        let force: Bool
    }

    typealias Loader = @MainActor (Request) async throws -> Payload

    private(set) var payloads: [String: Payload] = [:]
    private(set) var loading: Set<String> = []
    private(set) var failed: Set<String> = []
    private(set) var stale: Set<String> = []
    private(set) var visibleMonth: String
    private(set) var semesterId: String?

    @ObservationIgnored private let loader: Loader

    init(visibleMonth: String, semesterId: String?, loader: @escaping Loader) {
        self.visibleMonth = CalendarRange.monthFirst(visibleMonth)
        self.semesterId = semesterId
        self.loader = loader
    }

    // ---- 読み取り (すべて副作用なし) ----
    func payload(_ monthFirst: String) -> Payload? {
        payloads[CalendarRange.monthFirst(monthFirst)]
    }

    func isLoading(_ monthFirst: String) -> Bool {
        loading.contains(CalendarRange.monthFirst(monthFirst))
    }

    func hasFailed(_ monthFirst: String) -> Bool {
        failed.contains(CalendarRange.monthFirst(monthFirst))
    }

    var hasEverLoaded: Bool { payloads.isEmpty == false }

    // ---- 書き込み ----
    func setVisible(_ monthFirst: String, prefetch: [String]) async {
        let normalized = CalendarRange.monthFirst(monthFirst)
        visibleMonth = normalized
        await ensureLoaded(normalized)
        for month in prefetch {
            await ensureLoaded(month)
        }
    }

    func ensureLoaded(_ monthFirst: String, force: Bool = false) async {
        let normalized = CalendarRange.monthFirst(monthFirst)
        if loading.contains(normalized) { return }
        if !force, payloads[normalized] != nil, !stale.contains(normalized) { return }

        loading.insert(normalized)
        defer { loading.remove(normalized) }

        do {
            let range = CalendarRange.monthGridRange(anchorMonthFirst: normalized)
            let request = Request(
                monthFirst: normalized,
                rangeStart: range.start,
                rangeEnd: range.end,
                semesterId: semesterId,
                force: force
            )
            payloads[normalized] = try await loader(request)
            failed.remove(normalized)
            stale.remove(normalized)
        } catch {
            failed.insert(normalized)
        }
    }

    func setSemester(_ id: String?) async {
        guard semesterId != id else { return }
        semesterId = id
        // #B30 / #B30a / #B30b: payloads は捨てない。全消しすると hasEverLoaded が false に落ち、
        // CalendarScreenLogic.body が .skeleton に戻ってグリッドが一瞬消える (§3.5 / 要望 3 に違反)。
        stale = Set(payloads.keys)
        failed.removeAll()
        await ensureLoaded(visibleMonth)
    }

    func invalidateAll() {
        stale = Set(payloads.keys)
    }

    func refreshVisible() async {
        stale.formUnion(payloads.keys.filter { $0 != visibleMonth })
        await ensureLoaded(visibleMonth, force: true)
    }
}

enum CalendarEventOrder {
    /// date 昇順 → startMinute 昇順 → id 昇順
    static func byDateThenStart(_ lhs: CalendarEvent, _ rhs: CalendarEvent) -> Bool {
        if lhs.date != rhs.date { return lhs.date < rhs.date }
        if lhs.startMinute != rhs.startMinute { return lhs.startMinute < rhs.startMinute }
        return lhs.id < rhs.id
    }
}
