import Foundation
import Observation
import UIKit

/// 時間割の書き出しの唯一のオーケストレータ
@MainActor
@Observable
final class CalendarSyncCoordinator {
    @ObservationIgnored private let store: EventKitStore
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

    private var atenderCalendarId: String? {
        get { UserDefaults.standard.string(forKey: Keys.atenderCalendarId) }
        set { UserDefaults.standard.set(newValue, forKey: Keys.atenderCalendarId) }
    }

    init(store: EventKitStore, client: APIClient, cache: QueryClient, calendarRepository: CalendarExportRepository) {
        self.store = store
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

        // 3. カレンダー解決
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

        // 4. build 21 の移行 (権限と書き出し先が揃ってから実施)
        if let calendarId, !UserDefaults.standard.bool(forKey: Keys.b21Migrated) {
            let defaults = UserDefaults.standard
            let oldCoursesKey = "atender.eventkit.exportCourses"
            let current = exportEnabled
            let next = CalendarSyncMigration.exportEnabledAfterMigration(
                current: current,
                exportCoursesRaw: defaults.object(forKey: oldCoursesKey) as? Bool
            )
            let today = SchoolClock.todayString()
            let migrationInterval = dateInterval(from: CalendarRange.addDays(today, -730), to: CalendarRange.addDays(today, 730))
            do {
                if !next && current {
                    exportEnabled = false
                    _ = try await store.wipeOwned(calendarId: calendarId, window: migrationInterval)
                } else {
                    let existing = await store.fetchExported(calendarId: calendarId, window: migrationInterval)
                    let plan = CalendarExportPlanner.plan(desired: [], existing: existing, prunableKinds: [.personal])
                    _ = try await store.apply(plan, calendarId: calendarId)
                }
                lastSelfWriteAt = .now
                for key in CalendarSyncMigration.obsoleteKeys {
                    defaults.removeObject(forKey: key)
                }
                defaults.set(true, forKey: Keys.b21Migrated)
            } catch {
                // 全削除に失敗した場合も、次回は同じ分岐で再試行する。
                exportEnabled = current
                status.lastError = .applyFailed(error.localizedDescription)
                status.phase = .failed
                return
            }
        }

        // 5. 時間割の書き出し
        if exportEnabled, let calendarId {
            let desired: [ExportItem]
            let prunableKinds: Set<ExportKind>
            do {
                let range = try await calendarRepository.occurrenceRange(from: window.from, to: window.to)
                desired = CourseExportMapping.items(
                    occurrences: range.occurrences,
                    courseSuspensions: range.courseSuspensions,
                    timetableSuspensions: range.timetableSuspensions
                )
                prunableKinds = range.hasActiveTimetable ? [.meeting, .personal] : [.personal]
            } catch {
                status.lastError = .network(error.userFacingMessage)
                status.phase = .failed
                return
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

    private func dateInterval(from: String, to: String) -> DateInterval {
        let start = EventKitTimeMapping.jstDayStart(from)
        let end = EventKitTimeMapping.jstDayStart(CalendarRange.addDays(to, 1))
        return DateInterval(start: start, end: end)
    }

    private enum Keys {
        static let b21Migrated = "atender.eventkit.b21Migrated"
        static let exportEnabled = "atender.eventkit.exportEnabled"
        static let atenderCalendarId = "atender.eventkit.atenderCalendarId"
        static let legacyWriteTargetCalendarId = "atender.eventkit.writeTargetCalendarId"
    }
}
