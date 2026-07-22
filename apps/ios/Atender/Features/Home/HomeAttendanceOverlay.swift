import SwiftUI

enum HomeAttendance {
    static let dragThreshold: CGFloat = 40

    static func isActive(occurrences: [OccurrenceDto]) -> Bool { !occurrences.isEmpty }

    static func defaultExpanded(occurrences: [OccurrenceDto]) -> Bool {
        !occurrences.isEmpty && AttendanceSummary.unrecordedCount(occurrences) > 0
    }

    static func shouldCollapse(translationHeight: CGFloat, translationWidth: CGFloat) -> Bool {
        abs(translationHeight) > abs(translationWidth) && translationHeight > dragThreshold
    }
}

struct HomeAttendanceOverlay: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var viewModel: SelfTodayViewModel?
    @State private var expanded = false
    @State private var showDetail = false

    private let attendanceAnimation = Animation.spring(response: 0.35, dampingFraction: 0.86)

    var body: some View {
        TimelineView(.everyMinute) { context in
            let occurrences = viewModel?.occurrences ?? []
            let state = TodayTimeline.state(
                occurrences: occurrences,
                nowMinute: SchoolClock.nowMinute(context.date)
            )
            Group {
                if HomeAttendance.isActive(occurrences: occurrences) {
                    if expanded {
                        AttendanceTile(
                            state: state,
                            unrecordedCount: AttendanceSummary.unrecordedCount(occurrences),
                            pending: viewModel?.pending ?? false,
                            onMarkAllPresent: { Task { await viewModel?.markAll(.present) } },
                            onMarkAll: { status in Task { await viewModel?.markAll(status) } },
                            onOpenDetail: { showDetail = true },
                            onCollapse: {
                                withAnimation(attendanceAnimation) { expanded = false }
                            }
                        )
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                    } else {
                        AttendanceFab {
                            withAnimation(attendanceAnimation) { expanded = true }
                        }
                        .frame(maxWidth: .infinity, alignment: .trailing)
                        .padding(.trailing, Space.s5)
                        .padding(.bottom, Space.s5)
                    }
                }
            }
            .task(id: SchoolClock.todayString(context.date)) {
                if viewModel == nil { viewModel = SelfTodayViewModel(environment: environment) }
                if TodayTimeline.isStale(loadedDate: viewModel?.today?.date, now: context.date) {
                    await viewModel?.load()
                }
            }
            .onChange(of: viewModel?.today?.date) { _, newDate in
                guard newDate != nil else { return }
                expanded = HomeAttendance.defaultExpanded(occurrences: viewModel?.occurrences ?? [])
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

struct AttendanceFab: View {
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            Image(systemName: "chevron.up")
                .font(.atenderBase)
                .fontWeight(.bold)
                .foregroundStyle(Color.textPrimary)
                .frame(width: 56, height: 56)
                .background(Color.bgElevated)
                .clipShape(Circle())
                .atenderShadow(.card)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("attendance-fab")
        .accessibilityLabel("出欠を開く")
    }
}

struct AttendanceTile: View {
    let state: TodayState
    let unrecordedCount: Int
    let pending: Bool
    let onMarkAllPresent: () -> Void
    let onMarkAll: (AttendanceStatus) -> Void
    let onOpenDetail: () -> Void
    let onCollapse: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s2) {
            if state != .noClass, let status = NowNextText.statusLabel(state) {
                HStack(spacing: Space.s1) {
                    Text(status)
                    if let detail = NowNextText.detail(state) {
                        Text("·")
                        Text(detail)
                    }
                }
                .font(.caption2)
                .foregroundStyle(Color.textSecondary)
            }

            HStack(spacing: Space.s3) {
                if state != .noClass, let title = NowNextText.title(state) {
                    Text(title)
                        .font(.headline)
                        .fontWeight(.semibold)
                        .foregroundStyle(Color.textPrimary)
                        .lineLimit(2)
                }
                Spacer(minLength: Space.s2)
                markAllCTA
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
                .accessibilityLabel("各コマの出欠を開く")
            }
        }
        .padding(.vertical, Space.s3)
        .padding(.horizontal, Space.s4)
        .atenderGlass(in: RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
        .padding(.horizontal, Space.s4)
        .padding(.bottom, Space.s2)
        .highPriorityGesture(
            DragGesture(minimumDistance: 10)
                .onEnded { value in
                    if HomeAttendance.shouldCollapse(
                        translationHeight: value.translation.height,
                        translationWidth: value.translation.width
                    ) {
                        onCollapse()
                    }
                }
        )
    }

    private var markAllCTA: some View {
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
