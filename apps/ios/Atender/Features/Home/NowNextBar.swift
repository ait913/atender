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

func longLabel(_ status: AttendanceStatus) -> String {
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
