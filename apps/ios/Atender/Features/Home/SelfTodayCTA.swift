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
        today?.date ?? CalendarRange.todayString()
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

struct SelfTodayCTA: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var viewModel: SelfTodayViewModel?
    @State private var expanded = false

    var body: some View {
        Group {
            if let viewModel, !viewModel.isLoading, !viewModel.occurrences.isEmpty {
                MainAttendanceCTA(
                    occurrences: viewModel.occurrences,
                    expanded: expanded,
                    onToggle: { expanded.toggle() },
                    onMarkAll: { status in Task { await viewModel.markAll(status) } },
                    onChangeStatus: { id, status in Task { await viewModel.patch(id, status: status) } },
                    pending: viewModel.pending
                )
            }
        }
        .task {
            if viewModel == nil { viewModel = SelfTodayViewModel(environment: environment) }
            await viewModel?.load()
        }
    }
}

struct MainAttendanceCTA: View {
    let occurrences: [OccurrenceDto]
    let expanded: Bool
    let onToggle: () -> Void
    let onMarkAll: (AttendanceStatus) -> Void
    let onChangeStatus: (String, AttendanceStatus) -> Void
    var pending = false
    @State private var menuOpen = false
    @State private var keyboardVisible = false

    private let bulkStatuses: [AttendanceStatus] = [.absent, .excused, .tardy, .earlyLeave]
    private let allStatuses: [AttendanceStatus] = [.present, .absent, .excused, .tardy, .earlyLeave, .cancelled]

    var body: some View {
        if !keyboardVisible {
            VStack(spacing: Space.s2) {
                if expanded { expandedPanel }
                buttons
            }
            .padding(.horizontal, Space.pagePxMobile)
            .padding(.vertical, Space.s2)
            .padding(.bottom, Space.tabBarHeight)
            .background(.ultraThinMaterial)
            .background(Color.bgBase.opacity(0.85))
            .overlay(alignment: .top) { Rectangle().fill(Color.textPrimary.opacity(0.08)).frame(height: 1) }
            .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in keyboardVisible = true }
            .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in keyboardVisible = false }
        }
    }

    private var unrecorded: Int {
        occurrences.filter { $0.status == nil }.count
    }

    private var expandedPanel: some View {
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
                        HStack(spacing: Space.s3) {
                            ForEach(allStatuses) { status in
                                let selected = occurrence.status == status
                                Button {
                                    onChangeStatus(occurrence.id, status)
                                } label: {
                                    Text(shortLabel(status))
                                        .font(.atender(12, .bold))
                                        .foregroundStyle(selected ? Color.textOnAccent : Color.textPrimary)
                                        .frame(minWidth: 40, minHeight: 40)
                                        .padding(.horizontal, Space.s2)
                                        .background(selected ? Color.accent500 : Color.textPrimary.opacity(0.08))
                                        .clipShape(Capsule())
                                }
                                .buttonStyle(.plain)
                                .conditional(selected) { $0.atenderShadow(.glowSoft) }
                            }
                        }
                    }
                }
            }
            .padding(Space.s3)
        }
        .frame(maxHeight: UIScreen.main.bounds.height * 0.36)
        .background(Color.bgElevated)
        .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
        .atenderShadow(.card)
    }

    private var buttons: some View {
        HStack(spacing: Space.s3) {
            ZStack(alignment: .bottomLeading) {
                if menuOpen {
                    VStack(spacing: Space.s1) {
                        ForEach(bulkStatuses) { status in
                            Button {
                                menuOpen = false
                                onMarkAll(status)
                            } label: {
                                Text("全部 \(longLabel(status)) (\(unrecorded))")
                                    .font(.atenderSm)
                                    .fontWeight(.bold)
                                    .foregroundStyle(Color.textPrimary)
                                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                                    .padding(.horizontal, Space.s3)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(6)
                    .background(Color.bgElevated)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
                    .atenderShadow(.card)
                    .offset(y: -58)
                    .zIndex(2)
                }
                HStack(spacing: 0) {
                    Button {
                        menuOpen = false
                        onMarkAll(.present)
                    } label: {
                        Text(unrecorded == 0 ? "本日の記録は完了済" : "今日は全出席 (\(unrecorded))")
                            .font(.atenderSm)
                            .fontWeight(.bold)
                            .foregroundStyle(unrecorded == 0 ? Color.textPrimary : Color.textOnAccent)
                            .lineLimit(1)
                            .minimumScaleFactor(0.78)
                            .frame(maxWidth: .infinity, minHeight: 48)
                            .background(unrecorded == 0 ? Color.textPrimary.opacity(0.08) : Color.accent500)
                    }
                    .disabled(pending || unrecorded == 0)
                    Button {
                        if !(pending || unrecorded == 0) { menuOpen.toggle() }
                    } label: {
                        Image(systemName: "chevron.up.chevron.down")
                            .font(.atenderSm)
                            .fontWeight(.bold)
                            .foregroundStyle(unrecorded == 0 ? Color.textPrimary : Color.textOnAccent)
                            .frame(width: 48, height: 48)
                            .background(unrecorded == 0 ? Color.textPrimary.opacity(0.08) : Color.accent500)
                    }
                    .disabled(pending || unrecorded == 0)
                }
                .clipShape(Capsule())
                .atenderShadow(unrecorded == 0 ? .card : .glowSoft)
            }
            Button(action: onToggle) {
                Image(systemName: expanded ? "chevron.down" : "chevron.up")
                    .font(.atenderLg)
                    .fontWeight(.bold)
                    .foregroundStyle(Color.textPrimary)
                    .frame(width: 48, height: 48)
                    .background(Color.textPrimary.opacity(0.08))
                    .clipShape(Circle())
            }
            .buttonStyle(.plain)
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
}
