import SwiftUI

enum MeetingEditMode { case create, edit }

struct MeetingEditModal: View {
    @Environment(AppEnvironment.self) private var environment
    @Binding var isPresented: Bool
    let timetable: UserTimetableDto
    let mode: MeetingEditMode
    let initialDayOfWeekJs: Int?
    let initialPeriod: Int?
    let meeting: MeetingDto?
    var onSaved: (() -> Void)?

    @State private var courseId = ""
    @State private var dayOfWeekJs = 1
    @State private var periods: [Int] = []
    @State private var room = ""
    @State private var courseModalOpen = false
    @State private var createdCourses: [CourseDto] = []
    @State private var isPending = false
    @State private var errorText: String?

    private let dayLabels = ["日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"]

    var body: some View {
        ZStack {
            BottomSheet(title: mode == .create ? "授業を追加" : "授業を編集", isPresented: $isPresented) {
                VStack(alignment: .leading, spacing: Space.s4) {
                    Text("科目").sheetLabel()
                    Picker("科目", selection: $courseId) {
                        ForEach(allCourses) { course in
                            Text(course.name).tag(course.id)
                        }
                    }
                    .pickerStyle(.menu)
                    Button("＋ 科目を追加") { courseModalOpen = true }
                        .font(.atenderSm)
                        .fontWeight(.bold)

                    Text("曜日").sheetLabel()
                    if mode == .create {
                        Text(dayLabels[max(0, min(6, dayOfWeekJs))])
                            .font(.atenderBase)
                            .foregroundStyle(Color.textPrimary)
                            .padding(Space.s3)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color.bgMuted)
                            .clipShape(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
                    } else {
                        Picker("曜日", selection: $dayOfWeekJs) {
                            ForEach(0..<7, id: \.self) { Text(dayLabels[$0]).tag($0) }
                        }
                        .pickerStyle(.segmented)
                    }

                    Text("時限 (複数選択で連続コマ)").sheetLabel()
                    PeriodChips(value: $periods, periodCount: timetable.daySlots.count)
                    PeriodChipsPreview(periods: periods)

                    Text("教室").sheetLabel()
                    TextField("教室", text: $room)
                        .textFieldStyle(.roundedBorder)

                    if let errorText {
                        Text(errorText)
                            .font(.atenderSm)
                            .foregroundStyle(Color.statusAbsent)
                    }
                }
                .onChange(of: isPresented) { _, open in
                    if open { initialize() }
                }
                .onChange(of: periods) { oldValue, newValue in
                    enforcePeriodRule(previous: oldValue, next: newValue)
                }
            } footer: {
                HStack(spacing: Space.s3) {
                    AtenderButton(title: "キャンセル", variant: .ghost) { isPresented = false }
                    AtenderButton(title: "保存", variant: .primary, isLoading: isPending, isEnabled: canSave) {
                        Task { await save() }
                    }
                }
            }

            CourseEditModal(isPresented: $courseModalOpen, timetableId: timetable.id, stackLevel: 2) { course in
                createdCourses.removeAll { $0.id == course.id }
                createdCourses.append(course)
                courseId = course.id
            }
        }
    }

    private var allCourses: [CourseDto] {
        var map = Dictionary(uniqueKeysWithValues: timetable.courses.map { ($0.id, $0) })
        for course in createdCourses { map[course.id] = course }
        return Array(map.values).sorted { $0.name < $1.name }
    }

    private var canSave: Bool {
        !courseId.isEmpty && !periods.isEmpty && !isPending
    }

    private func initialize() {
        errorText = nil
        if mode == .edit, let meeting {
            courseId = meeting.courseId
            dayOfWeekJs = meeting.dayOfWeek
            periods = (0..<meeting.periodCount).map { meeting.startPeriodIndex + $0 }
            room = meeting.room ?? ""
        } else {
            courseId = timetable.courses.first?.id ?? ""
            dayOfWeekJs = initialDayOfWeekJs ?? 1
            periods = [initialPeriod ?? 1]
            room = ""
        }
    }

    private func enforcePeriodRule(previous: [Int], next: [Int]) {
        let sorted = Array(Set(next)).sorted()
        if mode == .create {
            if periods != sorted { periods = sorted }
        } else if PeriodGrouping.isContiguous(sorted) {
            if periods != sorted { periods = sorted }
        } else if let added = sorted.first(where: { !previous.contains($0) }) {
            periods = [added]
        } else {
            periods = Array(sorted.suffix(1))
        }
    }

    private func save() async {
        isPending = true
        defer { isPending = false }
        let trimmedRoom = room.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            if mode == .create {
                _ = try await environment.timetableRepository.createMeetingsBulk(.init(
                    userTimetableId: timetable.id,
                    courseId: courseId,
                    dayOfWeek: dayOfWeekJs,
                    startPeriodIndexes: periods,
                    room: trimmedRoom.isEmpty ? nil : trimmedRoom
                ))
            } else if let meeting {
                let range = PeriodGrouping.meetingRange(periods)
                _ = try await environment.timetableRepository.updateMeeting(id: meeting.id, .init(
                    dayOfWeek: dayOfWeekJs,
                    startPeriodIndex: range.startPeriodIndex,
                    periodCount: range.periodCount,
                    room: trimmedRoom.isEmpty ? nil : trimmedRoom
                ))
            }
            isPresented = false
            onSaved?()
        } catch {
            errorText = "保存できませんでした"
        }
    }
}

struct MeetingDetailSheet: View {
    @Binding var isPresented: Bool
    let meeting: MeetingDto?
    let course: CourseDto?
    let slots: [DaySlotDto]
    var onEdit: () -> Void
    var onDelete: () -> Void

    var body: some View {
        BottomSheet(title: "授業の詳細", isPresented: $isPresented) {
            if let meeting, let first = slots.first, let last = slots.last {
                VStack(alignment: .leading, spacing: Space.s4) {
                    HStack(spacing: Space.s4) {
                        Text(slots.count > 1 ? "\(first.periodIndex)-\(last.periodIndex)" : "\(first.periodIndex)")
                            .font(.atender5xl)
                            .fontWeight(.black)
                            .foregroundStyle(Color(hexString: course?.color ?? "#F97316"))
                        VStack(alignment: .leading, spacing: Space.s2) {
                            Text(course?.name ?? "授業")
                                .font(.atender2xl)
                                .fontWeight(.black)
                                .foregroundStyle(Color.textPrimary)
                            Text("\(["日", "月", "火", "水", "木", "金", "土"][meeting.dayOfWeek])曜日 · \(TimeFormatting.minutesToTime(first.startMinute)) – \(TimeFormatting.minutesToTime(last.endMinute))")
                                .font(.atenderSm)
                                .foregroundStyle(Color.textSecondary)
                        }
                    }
                    .padding(Space.s4)
                    .background(Color(hexString: course?.color ?? "#F97316").opacity(0.15))
                    .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
                    detailRow("教室", meeting.room)
                    detailRow("先生", course?.teacher)
                    detailRow("メモ", course?.note)
                }
            }
        } footer: {
            HStack(spacing: Space.s3) {
                AtenderButton(title: "削除", variant: .destructive) { onDelete() }
                AtenderButton(title: "閉じる", variant: .ghost) { isPresented = false }
                AtenderButton(title: "編集", variant: .primary) { onEdit() }
            }
        }
    }

    private func detailRow(_ label: String, _ value: String?) -> some View {
        HStack {
            Text(label).font(.atenderSm).foregroundStyle(Color.textTertiary)
            Spacer()
            Text((value?.isEmpty == false) ? value! : "—")
                .font(.atenderBase)
                .foregroundStyle(Color.textPrimary)
        }
    }
}

private extension Text {
    func sheetLabel() -> some View {
        self.font(.atenderSm).fontWeight(.bold).foregroundStyle(Color.textSecondary)
    }
}
