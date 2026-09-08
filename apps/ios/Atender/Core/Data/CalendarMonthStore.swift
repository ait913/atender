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
        let generation: Int
    }

    typealias Loader = @MainActor (Request) async throws -> Payload

    private(set) var payloads: [String: Payload] = [:]
    private(set) var loading: Set<String> = []
    private(set) var failed: Set<String> = []
    private(set) var stale: Set<String> = []
    private(set) var visibleMonth: String
    private(set) var semesterId: String?

    @ObservationIgnored private var generation = 0
    // 初回取得への通常の再入は、その取得が有効な状態で成功すれば充足する (#B34)。
    @ObservationIgnored private var pendingReload: [String: (force: Bool, required: Bool)] = [:]
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
        if loading.contains(normalized) {
            if force || stale.contains(normalized) || failed.contains(normalized) || payloads[normalized] == nil {
                let pending = pendingReload[normalized]
                pendingReload[normalized] = (
                    force: force || pending?.force == true,
                    required: force || stale.contains(normalized) || failed.contains(normalized) || pending?.required == true
                )
            }
            return
        }
        if !force, payloads[normalized] != nil, !stale.contains(normalized), !failed.contains(normalized) { return }

        loading.insert(normalized)
        defer { loading.remove(normalized) }
        var requestForce = force
        let range = CalendarRange.monthGridRange(anchorMonthFirst: normalized)

        while true {
            let request = Request(
                monthFirst: normalized,
                rangeStart: range.start,
                rangeEnd: range.end,
                semesterId: semesterId,
                force: requestForce,
                generation: generation
            )
            do {
                let payload = try await loader(request)
                // 旧学期の結果は stale / failed を含めて現在の状態に反映しない。
                if request.semesterId == semesterId {
                    payloads[normalized] = payload
                    if request.generation == generation {
                        failed.remove(normalized)
                        stale.remove(normalized)
                    } else {
                        // 同じ学期の古い世代は表示に使えるが、再取得が必要。
                        stale.insert(normalized)
                    }
                }
            } catch {
                if request.semesterId == semesterId {
                    failed.insert(normalized)
                    if request.generation != generation {
                        stale.insert(normalized)
                    }
                }
            }

            guard let pending = pendingReload.removeValue(forKey: normalized) else { return }
            guard pending.required || stale.contains(normalized) || failed.contains(normalized) || payloads[normalized] == nil else { return }
            // 非可視月の保留は次の ensureLoaded に任せる。
            guard normalized == visibleMonth else {
                stale.insert(normalized)
                return
            }
            requestForce = pending.force
        }
    }

    func setSemester(_ id: String?) async {
        guard semesterId != id else { return }
        semesterId = id
        generation += 1
        // #B30 / #B30a / #B30b: payloads は捨てない。全消しすると hasEverLoaded が false に落ち、
        // CalendarScreenLogic.body が .skeleton に戻ってグリッドが一瞬消える (§3.5 / 要望 3 に違反)。
        stale.formUnion(payloads.keys)
        stale.formUnion(loading)
        failed.removeAll()
        await ensureLoaded(visibleMonth)
    }

    func invalidateAll() {
        generation += 1
        stale.formUnion(payloads.keys)
        stale.formUnion(loading)
        if loading.contains(visibleMonth) {
            pendingReload[visibleMonth] = (force: pendingReload[visibleMonth]?.force == true, required: true)
        }
    }

    func refreshVisible() async {
        invalidateAll()
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
