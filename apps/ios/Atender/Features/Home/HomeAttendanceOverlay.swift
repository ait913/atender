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
    @State private var didApplyDefault = false

    private let attendanceAnimation = Animation.spring(response: 0.35, dampingFraction: 0.86)

    var body: some View {
        TimelineView(.everyMinute) { context in
            let occurrences = viewModel?.occurrences ?? []
            Group {
                if HomeAttendance.isActive(occurrences: occurrences) {
                    if expanded {
                        AttendancePanel(
                            state: TodayTimeline.state(
                                occurrences: occurrences,
                                nowMinute: SchoolClock.nowMinute(context.date)
                            ),
                            occurrences: occurrences,
                            unrecordedCount: AttendanceSummary.unrecordedCount(occurrences),
                            pending: viewModel?.pending ?? false,
                            onMarkAllPresent: { Task { await viewModel?.markAll(.present) } },
                            onMarkAll: { status in Task { await viewModel?.markAll(status) } },
                            onChangeStatus: { id, status in Task { await viewModel?.patch(id, status: status) } },
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
                didApplyDefault = true
            }
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
        .accessibilityIdentifier("cta-expand-toggle")
        .accessibilityLabel("出欠を開く")
    }
}

struct AttendancePanel: View {
    let state: TodayState
    let occurrences: [OccurrenceDto]
    let unrecordedCount: Int
    let pending: Bool
    let onMarkAllPresent: () -> Void
    let onMarkAll: (AttendanceStatus) -> Void
    let onChangeStatus: (String, AttendanceStatus) -> Void
    let onCollapse: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            grabber
            nowNextLine
            markAllCTA
            Divider()
            TodayAttendanceSheet(occurrences: occurrences, onChangeStatus: onChangeStatus)
                .frame(maxHeight: UIScreen.main.bounds.height * 0.5)
        }
        .padding(Space.s4)
        .atenderGlass(in: RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
        .padding(.horizontal, Space.s2)
    }

    private var grabber: some View {
        Capsule()
            .fill(Color.borderEmphasis)
            .frame(width: 42, height: 5)
            .frame(maxWidth: .infinity, minHeight: 28)
            .contentShape(Rectangle())
            .accessibilityIdentifier("attendance-panel-grabber")
            .onTapGesture { onCollapse() }
            .gesture(
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

    private var nowNextLine: some View {
        VStack(alignment: .leading, spacing: Space.s1) {
            if let status = NowNextText.statusLabel(state) {
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

            if let title = NowNextText.title(state) {
                Text(title)
                    .font(.headline)
                    .fontWeight(.semibold)
                    .foregroundStyle(Color.textPrimary)
                    .lineLimit(2)
            }
        }
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
