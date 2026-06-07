import SwiftUI

struct TimetableView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var viewModel: TimetableViewModel?

    var body: some View {
        Group {
            if let viewModel {
                content(viewModel)
            } else {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.bgBase)
            }
        }
        .navigationTitle("時間割")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                if let semesterId = viewModel?.timetable?.semesterId {
                    NavigationLink {
                        SemesterOverviewView(semesterId: semesterId)
                    } label: {
                        Image(systemName: "chart.bar.xaxis")
                    }
                }
            }
        }
        .task {
            if viewModel == nil {
                let created = TimetableViewModel(
                    apiClient: environment.apiClient,
                    defaultSemesterId: environment.authStore.me?.user.defaultSemesterId
                )
                viewModel = created
                await created.load()
            }
        }
        .refreshable {
            await viewModel?.load()
        }
        .alert("エラー", isPresented: .constant(viewModel?.alertMessage != nil)) {
            Button("OK") { viewModel?.alertMessage = nil }
        } message: {
            Text(viewModel?.alertMessage ?? "")
        }
    }

    @ViewBuilder
    private func content(_ model: TimetableViewModel) -> some View {
        if model.isLoading && model.timetable == nil {
            ProgressView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.bgBase)
        } else if let timetable = model.timetable {
            ScrollView([.horizontal, .vertical]) {
                VStack(alignment: .leading, spacing: Space.s3) {
                    Text(timetable.title)
                        .font(.atenderXl.weight(.bold))
                        .foregroundStyle(Color.textPrimary)
                        .padding(.horizontal, Space.pagePadding)

                    Grid(alignment: .topLeading, horizontalSpacing: Space.s2, verticalSpacing: Space.s2) {
                        GridRow {
                            Text("")
                                .frame(width: 52)
                            ForEach(timetable.daysOfWeek, id: \.self) { day in
                                Text(dayLabel(day))
                                    .font(.atenderSm.weight(.semibold))
                                    .foregroundStyle(Color.textSecondary)
                                    .frame(width: 104)
                            }
                        }

                        ForEach(timetable.daySlots.filter { !$0.isBreak }) { slot in
                            GridRow {
                                VStack(spacing: Space.s1) {
                                    Text(slot.label)
                                        .font(.atenderSm.weight(.semibold))
                                    Text("\(slot.startMinute.hhmm)")
                                        .font(.atenderXs)
                                }
                                .foregroundStyle(Color.textSecondary)
                                .frame(width: 52)
                                .frame(minHeight: 56)

                                ForEach(timetable.daysOfWeek, id: \.self) { day in
                                    let meeting = meetingFor(timetable: timetable, day: day, period: slot.periodIndex)
                                    let course = meeting.flatMap { meeting in timetable.courses.first { $0.id == meeting.courseId } }
                                    MeetingBlock(meeting: meeting, course: course)
                                        .frame(width: 104)
                                }
                            }
                        }
                    }
                    .padding(Space.pagePadding)
                }
            }
            .background(Color.bgBase)
        } else {
            ContentUnavailableView("時間割がありません", systemImage: "calendar.badge.exclamationmark", description: Text("Web で時間割を作成してください。"))
                .background(Color.bgBase)
        }
    }

    private func meetingFor(timetable: UserTimetableDto, day: Int, period: Int) -> MeetingDto? {
        timetable.meetings.first {
            normalizedDay($0.dayOfWeek) == normalizedDay(day) && $0.startPeriodIndex == period
        }
    }

    private func normalizedDay(_ value: Int) -> Int {
        if value == 7 { return 0 }
        return value
    }

    private func dayLabel(_ day: Int) -> String {
        switch normalizedDay(day) {
        case 0: return "日"
        case 1: return "月"
        case 2: return "火"
        case 3: return "水"
        case 4: return "木"
        case 5: return "金"
        case 6: return "土"
        default: return "\(day)"
        }
    }
}
