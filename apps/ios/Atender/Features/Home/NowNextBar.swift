import SwiftUI

@MainActor
@Observable
final class SelfTodayViewModel {
    @ObservationIgnored private let environment: AppEnvironment
    var today: TodayResponse?
    var isLoading = false
    var pending = false

    init(environment: AppEnvironment) {
        self.environment = environment
    }

    var occurrences: [OccurrenceDto] {
        (today?.occurrences ?? []).sorted { $0.startMinute < $1.startMinute }
    }

    var date: String {
        today?.date ?? SchoolClock.todayString()
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            today = try await environment.attendanceRepository.loadToday()
        } catch APIError.api(let status, let code, _) where status == 403 && code == "SETUP_REQUIRED" {
            await environment.authStore.refreshMe()
        } catch {
            today = nil
        }
    }

    func markAll(_ status: AttendanceStatus) async {
        pending = true
        await environment.attendanceRepository.markAllPresent(date: date, status: status)
        today = environment.queryClient.data(for: .today(), as: TodayResponse.self)
        pending = false
    }

    func patch(_ occurrenceId: String, status: AttendanceStatus) async {
        await environment.attendanceRepository.patchAttendance(occurrenceId: occurrenceId, status: status)
        today = environment.queryClient.data(for: .today(), as: TodayResponse.self)
    }
}

struct NowNextBar: View {
    let state: TodayState
    let unrecordedCount: Int
    let pending: Bool
    let onMarkAllPresent: () -> Void
    let onMarkAll: (AttendanceStatus) -> Void
    let onOpenDetail: () -> Void

    var body: some View {
        if state != .noClass,
           let status = NowNextText.statusLabel(state),
           let title = NowNextText.title(state) {
            VStack(alignment: .leading, spacing: Space.s2) {
                HStack(spacing: Space.s1) {
                    Text(status)
                    if let detail = NowNextText.detail(state) {
                        Text("·")
                        Text(detail)
                    }
                }
                .font(.caption2)
                .foregroundStyle(Color.textSecondary)

                HStack(spacing: Space.s3) {
                    Text(title)
                        .font(.headline)
                        .fontWeight(.semibold)
                        .foregroundStyle(Color.textPrimary)
                        .lineLimit(2)
                    Spacer(minLength: Space.s2)
                    actionMenu
                    Button(action: onOpenDetail) {
                        Image(systemName: "chevron.up")
                            .font(.atenderBase)
                            .fontWeight(.bold)
                            .foregroundStyle(Color.textPrimary)
                            .frame(width: 44, height: 44)
                            .background(Color.textPrimary.opacity(0.08))
                            .clipShape(Circle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("cta-expand-toggle")
                }
            }
            .padding(.vertical, Space.s3)
            .padding(.horizontal, Space.s4)
            .atenderGlass(in: RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
            .padding(.horizontal, Space.s4)
            .padding(.vertical, Space.s2)
        }
    }

    private var actionMenu: some View {
        Menu {
            ForEach([AttendanceStatus.absent, .excused, .tardy, .earlyLeave]) { status in
                Button("全部 \(longLabel(status)) (\(unrecordedCount))") { onMarkAll(status) }
            }
        } label: {
            Text(unrecordedCount == 0 ? "本日の記録は完了済" : "今日は全出席 (\(unrecordedCount))")
                .lineLimit(1)
                .minimumScaleFactor(0.78)
        } primaryAction: {
            onMarkAllPresent()
        }
        .buttonStyle(.borderedProminent)
        .buttonBorderShape(.capsule)
        .frame(minHeight: 44)
        .disabled(pending || unrecordedCount == 0)
        .sensoryFeedback(.success, trigger: unrecordedCount)
    }
}

struct NowNextBarHost: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var viewModel: SelfTodayViewModel?
    @State private var showDetail = false

    var body: some View {
        TimelineView(.everyMinute) { context in
            let occurrences = viewModel?.occurrences ?? []
            let state = TodayTimeline.state(occurrences: occurrences, nowMinute: SchoolClock.nowMinute(context.date))
            NowNextBar(
                state: state,
                unrecordedCount: AttendanceSummary.unrecordedCount(occurrences),
                pending: viewModel?.pending ?? false,
                onMarkAllPresent: { Task { await viewModel?.markAll(.present) } },
                onMarkAll: { status in Task { await viewModel?.markAll(status) } },
                onOpenDetail: { showDetail = true }
            )
            .task(id: SchoolClock.todayString(context.date)) {
                if viewModel == nil { viewModel = SelfTodayViewModel(environment: environment) }
                if TodayTimeline.isStale(loadedDate: viewModel?.today?.date, now: context.date) {
                    await viewModel?.load()
                }
            }
        }
        .sheet(isPresented: $showDetail) {
            TodayAttendanceSheet(
                occurrences: viewModel?.occurrences ?? [],
                onChangeStatus: { id, status in Task { await viewModel?.patch(id, status: status) } }
            )
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
    }
}

struct TodayAttendanceSheet: View {
    let occurrences: [OccurrenceDto]
    let onChangeStatus: (String, AttendanceStatus) -> Void

    private let allStatuses: [AttendanceStatus] = [.present, .absent, .excused, .tardy, .earlyLeave, .cancelled]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Space.s4) {
                ForEach(occurrences) { occurrence in
                    VStack(alignment: .leading, spacing: Space.s2) {
                        HStack(alignment: .firstTextBaseline) {
                            Text("\(occurrence.periodIndex)限")
                                .foregroundStyle(Color.accent500)
                            Text(occurrence.courseName)
                            Spacer()
                            Text(occurrence.room ?? "")
                                .font(.atenderXs)
                                .foregroundStyle(Color.textTertiary)
                        }
                        .font(.atenderBase)
                        .fontWeight(.bold)

                        HStack(spacing: Space.s2) {
                            ForEach(allStatuses) { status in
                                let selected = occurrence.status == status
                                Button {
                                    onChangeStatus(occurrence.id, status)
                                } label: {
                                    Text(shortLabel(status))
                                        .font(.caption)
                                        .fontWeight(.bold)
                                        .foregroundStyle(selected ? Color.textOnAccent : Color.textPrimary)
                                        .frame(maxWidth: .infinity, minHeight: 44)
                                        .background(selected ? Color.accent500 : Color.textPrimary.opacity(0.08))
                                        .clipShape(Capsule())
                                }
                                .buttonStyle(.plain)
                                .conditional(selected) { $0.atenderShadow(.glowSoft) }
                            }
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .padding(Space.s3)
                    .background(Color.bgElevated)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
                }
            }
            .padding(Space.s4)
        }
    }

    private func shortLabel(_ status: AttendanceStatus) -> String {
        switch status {
        case .present: return "出"
        case .absent: return "欠"
        case .excused: return "公"
        case .tardy: return "遅"
        case .earlyLeave: return "早"
        case .cancelled: return "休"
        case .unknown: return "?"
        }
    }
}

private func longLabel(_ status: AttendanceStatus) -> String {
    switch status {
    case .present: return "出席"
    case .absent: return "欠席"
    case .excused: return "公欠"
    case .tardy: return "遅刻"
    case .earlyLeave: return "早退"
    case .cancelled: return "休講"
    case .unknown: return "未記録"
    }
}
