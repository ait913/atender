import Foundation
import Observation
import UIKit

/// 書き出し/読み込みの唯一のオーケストレータ (§6.5)
@MainActor
@Observable
final class CalendarSyncCoordinator {
    @ObservationIgnored private let store: EventKitStore
    @ObservationIgnored private let client: APIClient
    @ObservationIgnored private let cache: QueryClient
    @ObservationIgnored private let calendarRepository: CalendarExportRepository

    private(set) var status = CalendarSyncStatus()

    @ObservationIgnored private var isRunning = false
    @ObservationIgnored private var lastRunAt: Date?
    @ObservationIgnored private var lastSelfWriteAt: Date?
    @ObservationIgnored private var didFailCreateThisSession = false
    @ObservationIgnored private var storeChangedObserver: NSObjectProtocol?
    @ObservationIgnored private var foregroundObserver: NSObjectProtocol?
    @ObservationIgnored private var storeChangedTask: Task<Void, Never>?

    // MARK: - 永続設定 (§4.2)

    var exportEnabled: Bool {
        get { UserDefaults.standard.object(forKey: Keys.exportEnabled) == nil ? true : UserDefaults.standard.bool(forKey: Keys.exportEnabled) }
        set { UserDefaults.standard.set(newValue, forKey: Keys.exportEnabled) }
    }

    var exportCourses: Bool {
        get { UserDefaults.standard.object(forKey: Keys.exportCourses) == nil ? true : UserDefaults.standard.bool(forKey: Keys.exportCourses) }
        set { UserDefaults.standard.set(newValue, forKey: Keys.exportCourses) }
    }

    var exportPersonal: Bool {
        get { UserDefaults.standard.object(forKey: Keys.exportPersonal) == nil ? true : UserDefaults.standard.bool(forKey: Keys.exportPersonal) }
        set { UserDefaults.standard.set(newValue, forKey: Keys.exportPersonal) }
    }

    var linkedCalendarIds: Set<String> {
        get { Set(UserDefaults.standard.stringArray(forKey: Keys.linkedCalendarIds) ?? []) }
        set { UserDefaults.standard.set(Array(newValue), forKey: Keys.linkedCalendarIds) }
    }

    var promptDismissed: Bool {
        get { UserDefaults.standard.bool(forKey: Keys.promptDismissed) }
        set { UserDefaults.standard.set(newValue, forKey: Keys.promptDismissed) }
    }

    private var atenderCalendarId: String? {
        get { UserDefaults.standard.string(forKey: Keys.atenderCalendarId) }
        set { UserDefaults.standard.set(newValue, forKey: Keys.atenderCalendarId) }
    }

    private var legacyPushCleanupDone: Bool {
        get { UserDefaults.standard.bool(forKey: Keys.legacyPushCleanupDone) }
        set { UserDefaults.standard.set(newValue, forKey: Keys.legacyPushCleanupDone) }
    }

    init(store: EventKitStore, client: APIClient, cache: QueryClient, calendarRepository: CalendarExportRepository) {
        self.store = store
        self.client = client
        self.cache = cache
        self.calendarRepository = calendarRepository
        // 廃止キーの掃除 (冪等)
        UserDefaults.standard.removeObject(forKey: Keys.legacyWriteTargetCalendarId)
        status.access = EventKitStore.currentAccess()
        cache.onInvalidate = { [weak self] keys in
            guard let self, !self.isRunning, CalendarSyncTrigger.isDataChange(keys) else { return }
            Task { await self.sync(trigger: .dataChanged) }
        }
    }

    // MARK: - 権限

    func refreshAccess() {
        status.access = EventKitStore.currentAccess()
    }

    func requestFullAccess() async {
        let next = await store.requestFullAccess()
        status.access = next
        if next == .fullAccess {
            await sync(trigger: .permissionGranted)
        }
    }

    /// ★ Atender カレンダーを除いた一覧 (§3 の除外 1 層目)
    func availableCalendars() async -> [EKCalendarSnapshot] {
        guard EventKitStore.currentAccess() == .fullAccess else { return [] }
        let snapshot = await store.snapshot()
        var excluded = Set<String>()
        if let atenderCalendarId { excluded.insert(atenderCalendarId) }
        if case .use(let id) = AtenderCalendarResolver.resolve(
            storedId: atenderCalendarId,
            calendars: snapshot.calendars,
            sources: snapshot.sources,
            defaultCalendarSourceId: snapshot.defaultCalendarSourceId,
            allowCreate: false
        ) {
            excluded.insert(id)
        }
        return snapshot.calendars.filter { !excluded.contains($0.id) && $0.title != AtenderCalendarSpec.title }
    }

    // MARK: - 同期 (唯一の入口)

    func sync(trigger: SyncTrigger) async {
        guard CalendarSyncTrigger.shouldRun(
            trigger: trigger,
            now: .now,
            lastRunAt: lastRunAt,
            lastSelfWriteAt: lastSelfWriteAt,
            isRunning: isRunning
        ) else { return }

        if trigger == .manual { didFailCreateThisSession = false }

        status.access = EventKitStore.currentAccess()
        guard status.access == .fullAccess else {
            status.phase = .idle
            switch status.access {
            case .notDetermined: status.lastError = .accessNotDetermined
            case .denied: status.lastError = .accessDenied
            case .restricted: status.lastError = .accessRestricted
            case .writeOnly: status.lastError = .accessWriteOnly
            case .fullAccess: break
            }
            return
        }

        status.phase = .running
        isRunning = true
        lastRunAt = .now
        defer { isRunning = false }

        let window = ExportWindow.around(today: SchoolClock.todayString())
        let interval = dateInterval(from: window.from, to: window.to)

        // 6. カレンダー解決
        let snapshot = await store.snapshot()
        var calendarId: String?
        switch AtenderCalendarResolver.resolve(
            storedId: atenderCalendarId,
            calendars: snapshot.calendars,
            sources: snapshot.sources,
            defaultCalendarSourceId: snapshot.defaultCalendarSourceId,
            allowCreate: exportEnabled && !didFailCreateThisSession
        ) {
        case .use(let id):
            atenderCalendarId = id
            calendarId = id
            if let resolved = snapshot.calendars.first(where: { $0.id == id }) {
                status.calendarTitle = "\(resolved.title)（\(resolved.sourceTitle)）"
            }
        case .createNew(let sourceId):
            do {
                let id = try await store.createCalendar(
                    title: AtenderCalendarSpec.title,
                    colorHex: AtenderCalendarSpec.colorHex,
                    sourceId: sourceId
                )
                atenderCalendarId = id
                calendarId = id
                let sourceTitle = snapshot.sources.first(where: { $0.id == sourceId })?.title ?? ""
                status.calendarTitle = sourceTitle.isEmpty ? AtenderCalendarSpec.title : "\(AtenderCalendarSpec.title)（\(sourceTitle)）"
            } catch {
                didFailCreateThisSession = true
                status.lastError = (error as? CalendarSyncError) ?? .calendarCreateFailed(error.localizedDescription)
                status.phase = .failed
            }
        case .unavailable(let error):
            status.lastError = error
            status.phase = .failed
        }

        // 7. legacy 掃除 (一度きり)
        if let calendarId, !legacyPushCleanupDone {
            await cleanUpLegacyPushes(excludingCalendarId: calendarId)
        }

        // 8. 読み込み (Atender カレンダーは構造的に除外)
        let importIds = linkedCalendarIds.subtracting(atenderCalendarId.map { [$0] } ?? [])
        if !importIds.isEmpty {
            do {
                let snapshots = await store.fetchSnapshots(range: interval, calendarIds: importIds)
                let input = EventKitSyncInput(
                    range: .init(from: window.from, to: window.to),
                    events: EventKitReconciler.uploads(from: snapshots)
                )
                _ = try await client.send(Endpoints.eventKitSync(input), as: EventKitSyncResponse.self)
            } catch {
                status.lastError = .network(error.localizedDescription)
                status.phase = .failed
            }
        }

        // 9. 書き出し
        if exportEnabled, let calendarId {
            var desired: [ExportItem] = []
            var prunableKinds = Set<ExportKind>()

            if exportCourses {
                do {
                    let range = try await calendarRepository.occurrenceRange(from: window.from, to: window.to)
                    desired += CourseExportMapping.items(
                        occurrences: range.occurrences,
                        courseSuspensions: range.courseSuspensions,
                        timetableSuspensions: range.timetableSuspensions
                    )
                    if range.hasActiveTimetable { prunableKinds.insert(.meeting) }
                } catch {
                    status.lastError = .network(error.localizedDescription)
                    status.phase = .failed
                    return
                }
            } else {
                prunableKinds.insert(.meeting)
            }

            if exportPersonal {
                do {
                    let response = try await client.send(
                        Endpoints.personalEvents(from: window.from, to: window.to),
                        as: PersonalEventsResponse.self
                    )
                    desired += PersonalExportMapping.items(occurrences: response.events)
                    prunableKinds.insert(.personal)
                } catch {
                    status.lastError = .network(error.localizedDescription)
                    status.phase = .failed
                    return
                }
            } else {
                prunableKinds.insert(.personal)
            }

            let existing = await store.fetchExported(calendarId: calendarId, window: interval)
            let existingOwnedCount = existing.filter { ExportKey.isOwned($0.key) }.count
            let plan = CalendarExportPlanner.plan(desired: desired, existing: existing, prunableKinds: prunableKinds)

            if plan.isEmpty {
                status.lastSummary = ExportSummary(unchanged: plan.unchanged, foreign: plan.foreign)
            } else {
                do {
                    let summary = try await store.apply(plan, calendarId: calendarId)
                    lastSelfWriteAt = .now
                    status.lastSummary = summary
                } catch {
                    status.lastError = (error as? CalendarSyncError) ?? .applyFailed(error.localizedDescription)
                    status.phase = .failed
                    return
                }
                if CalendarExportPlanner.shouldVerifyIdentity(plan: plan, existingOwnedCount: existingOwnedCount) {
                    let verified = await store.fetchExported(calendarId: calendarId, window: interval)
                    if verified.filter({ ExportKey.isOwned($0.key) }).isEmpty {
                        status.lastError = .identityUnavailable
                        status.phase = .failed
                        return
                    }
                }
            }
        }

        if status.phase != .failed {
            status.phase = .succeeded
            status.lastSuccessAt = .now
            status.lastError = nil
        }

        // 11. 読み込みで新しいミラーが入りうる (isRunning 中なので TR-6 は再帰しない)
        cache.invalidate(prefixes: [.personalEvents()])
    }

    func setExportEnabled(_ value: Bool) async {
        exportEnabled = value
        if value {
            await sync(trigger: .manual)
        } else {
            await wipeExport()
        }
    }

    /// Atender カレンダー内の owned を ±2 年で全削除する (カレンダー自体は残す)
    func wipeExport() async {
        guard EventKitStore.currentAccess() == .fullAccess else { return }
        guard let calendarId = atenderCalendarId else { return }
        let today = SchoolClock.todayString()
        let interval = dateInterval(from: CalendarRange.addDays(today, -730), to: CalendarRange.addDays(today, 730))
        do {
            _ = try await store.wipeOwned(calendarId: calendarId, window: interval)
            lastSelfWriteAt = .now
            status.lastSummary = nil
            status.lastError = nil
        } catch {
            status.lastError = (error as? CalendarSyncError) ?? .applyFailed(error.localizedDescription)
            status.phase = .failed
        }
    }

    func startObserving() {
        if storeChangedObserver == nil {
            let onChange: @MainActor @Sendable () -> Void = { [weak self] in
                self?.scheduleStoreChangedSync()
            }
            storeChangedObserver = NotificationCenter.default.addObserver(
                forName: .EKEventStoreChanged, object: nil, queue: .main
            ) { _ in
                Task { @MainActor in onChange() }
            }
        }
        if foregroundObserver == nil {
            let onForeground: @MainActor @Sendable () -> Void = { [weak self] in
                guard let self else { return }
                Task { await self.sync(trigger: .foreground) }
            }
            foregroundObserver = NotificationCenter.default.addObserver(
                forName: UIApplication.willEnterForegroundNotification, object: nil, queue: .main
            ) { _ in
                Task { @MainActor in onForeground() }
            }
        }
    }

    // MARK: - private

    private func scheduleStoreChangedSync() {
        storeChangedTask?.cancel()
        storeChangedTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(CalendarSyncTrigger.storeChangedDebounce * 1_000_000_000))
            guard !Task.isCancelled else { return }
            await self?.sync(trigger: .storeChanged)
        }
    }

    private func cleanUpLegacyPushes(excludingCalendarId: String) async {
        do {
            let externalIds = try await calendarRepository.legacyEkPushes()
            if externalIds.isEmpty {
                legacyPushCleanupDone = true
                return
            }
            _ = await store.removeEvents(externalIds: externalIds, excludingCalendarId: excludingCalendarId)
            _ = try await calendarRepository.clearLegacyEkPushes(externalIds)
            legacyPushCleanupDone = true
        } catch {
            // フラグを立てず次回に再試行 (冪等)
        }
    }

    private func dateInterval(from: String, to: String) -> DateInterval {
        let start = EventKitTimeMapping.jstDayStart(from)
        let end = EventKitTimeMapping.jstDayStart(CalendarRange.addDays(to, 1))
        return DateInterval(start: start, end: end)
    }

    private enum Keys {
        static let exportEnabled = "atender.eventkit.exportEnabled"
        static let exportCourses = "atender.eventkit.exportCourses"
        static let exportPersonal = "atender.eventkit.exportPersonal"
        static let atenderCalendarId = "atender.eventkit.atenderCalendarId"
        static let linkedCalendarIds = "atender.eventkit.linkedCalendarIds"
        static let promptDismissed = "atender.eventkit.promptDismissed"
        static let legacyPushCleanupDone = "atender.eventkit.legacyPushCleanupDone"
        static let legacyWriteTargetCalendarId = "atender.eventkit.writeTargetCalendarId"
    }
}
