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

    static func shouldExpand(translationHeight: CGFloat, translationWidth: CGFloat) -> Bool {
        abs(translationHeight) > abs(translationWidth) && translationHeight < -dragThreshold
    }
}

struct HomeAttendanceOverlay: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var viewModel: SelfTodayViewModel?
    @State private var expanded = false
    @State private var showDetail = false

    private let attendanceAnimation = Animation.easeInOut(duration: 0.28)

    var body: some View {
        TimelineView(.everyMinute) { context in
            let occurrences = viewModel?.occurrences ?? []
            let state = TodayTimeline.state(
                occurrences: occurrences,
                nowMinute: SchoolClock.nowMinute(context.date)
            )
            let unrecorded = AttendanceSummary.unrecordedCount(occurrences)
            Group {
                if HomeAttendance.isActive(occurrences: occurrences) {
                    VStack(spacing: Space.s1) {
                        grabberBand(isExpanded: expanded)
                        if expanded {
                            AttendanceTile(
                                state: state,
                                unrecordedCount: unrecorded,
                                pending: viewModel?.pending ?? false,
                                onMarkAllPresent: { Task { await viewModel?.markAll(.present) } },
                                onMarkAll: { status in Task { await viewModel?.markAll(status) } },
                                onOpenDetail: { showDetail = true }
                            )
                            .transition(.opacity)
                        }
                    }
                    .background {
                        Color.clear
                            .atenderGlass(in: RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
                            .opacity(expanded ? 1 : 0)
                    }
                    .padding(.horizontal, Space.s4)
                    .padding(.bottom, Space.s2)
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
                withAnimation(attendanceAnimation) {
                    expanded = HomeAttendance.defaultExpanded(occurrences: viewModel?.occurrences ?? [])
                }
            }
            .onChange(of: unrecorded) { oldValue, newValue in
                if oldValue > 0, newValue == 0 {
                    withAnimation(attendanceAnimation) { expanded = false }
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

    private func grabberBand(isExpanded: Bool) -> some View {
        Capsule()
            .fill(Color.borderEmphasis)
            .frame(width: 42, height: 5)
            .frame(maxWidth: .infinity, minHeight: 36)
            .contentShape(Rectangle())
            .accessibilityIdentifier("attendance-grabber")
            .accessibilityAddTraits(.isButton)
            .accessibilityLabel("出欠の開閉")
            .onTapGesture {
                withAnimation(attendanceAnimation) { expanded.toggle() }
            }
            .highPriorityGesture(
                DragGesture(minimumDistance: 10).onEnded { value in
                    let h = value.translation.height
                    let w = value.translation.width
                    if isExpanded, HomeAttendance.shouldCollapse(translationHeight: h, translationWidth: w) {
                        withAnimation(attendanceAnimation) { expanded = false }
                    } else if !isExpanded, HomeAttendance.shouldExpand(translationHeight: h, translationWidth: w) {
                        withAnimation(attendanceAnimation) { expanded = true }
                    }
                }
            )
    }
}

struct AttendanceTile: View {
    let state: TodayState
    let unrecordedCount: Int
    let pending: Bool
    let onMarkAllPresent: () -> Void
    let onMarkAll: (AttendanceStatus) -> Void
    let onOpenDetail: () -> Void

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
