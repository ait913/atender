import SwiftUI

struct CourseDetailModal: View {
    let courseId: String
    let onClose: () -> Void
    @Environment(AppEnvironment.self) private var environment
    @State private var timetables: [UserTimetableDto] = []
    @State private var editOpen = false
    @State private var isLoading = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Space.s4) {
                if let found = findCourse() {
                    courseEditSection(course: found.course, timetable: found.timetable)
                    CourseSuspensionSection(courseId: courseId)
                    CourseOccurrenceHistory(courseId: courseId, semesterId: found.timetable.semesterId)
                    DangerZone(courseId: courseId, onDeleted: onClose)
                } else if isLoading {
                    ProgressView().frame(maxWidth: .infinity)
                } else {
                    Panel {
                        Text("科目が見つかりません")
                            .font(.atenderBase.weight(.bold))
                            .foregroundStyle(Color.textPrimary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
            .padding(Space.pagePxMobile)
            .padding(.bottom, Space.s6)
        }
        .task { await load() }
        .background {
            if let found = findCourse() {
                CourseEditModal(isPresented: $editOpen, timetableId: found.timetable.id, course: found.course, stackLevel: 1) { _ in
                    Task { await load(force: true) }
                }
            }
        }
    }

    private func courseEditSection(course: CourseDto, timetable: UserTimetableDto) -> some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: Space.s1) {
                    Text(course.name)
                        .font(.atenderBase.weight(.bold))
                        .foregroundStyle(Color.textPrimary)
                    Text(course.teacher ?? "先生未設定")
                        .font(.atenderSm)
                        .foregroundStyle(Color.textSecondary)
                    if let note = course.note, !note.isEmpty {
                        Text(note)
                            .font(.atenderSm)
                            .foregroundStyle(Color.textTertiary)
                    }
                }
                Spacer()
                AtenderButton(title: "編集", variant: .primary, size: .sm) { editOpen = true }
                    .frame(width: 84)
            }
        }
        .padding(Space.s4)
        .background(Color.bgElevated)
        .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
        .atenderShadow(.card)
    }

    private func load(force: Bool = false) async {
        isLoading = true
        defer { isLoading = false }
        if let loaded = try? await environment.timetableRepository.userTimetables(force: force) {
            timetables = loaded
        }
    }

    private func findCourse() -> (course: CourseDto, timetable: UserTimetableDto)? {
        for timetable in timetables {
            if let course = timetable.courses.first(where: { $0.id == courseId }) {
                return (course, timetable)
            }
        }
        return nil
    }
}

struct CourseSuspensionSection: View {
    let courseId: String
    @Environment(AppEnvironment.self) private var environment
    @State private var suspensions: [CourseSuspensionDto] = []
    @State private var date = SchoolClock.todayString()
    @State private var reason = ""
    @State private var errorMessage: String?
    @State private var isPending = false

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            Text("休講日")
                .font(.atenderBase.weight(.bold))
                .foregroundStyle(Color.textPrimary)
            if suspensions.isEmpty {
                Text("休講日はまだ登録されていません")
                    .font(.atenderSm)
                    .foregroundStyle(Color.textTertiary)
            } else {
                ForEach(suspensions) { suspension in
                    HStack(spacing: Space.s2) {
                        Text(CalendarRange.format(suspension.date, .monthDay))
                            .font(.atenderSm.weight(.bold).monospacedDigit())
                            .foregroundStyle(Color.textPrimary)
                        Text(suspension.reason ?? "")
                            .font(.atenderSm)
                            .foregroundStyle(Color.textSecondary)
                        Spacer()
                        Button {
                            Task { await delete(suspension) }
                        } label: {
                            Image(systemName: "trash")
                                .foregroundStyle(Color.statusAbsent)
                                .frame(width: 32, height: 32)
                        }
                    }
                }
            }
            DatePicker("", selection: Binding(
                get: { SemesterDateBinding.date(from: date) },
                set: { date = SemesterDateBinding.string(from: $0) }
            ), displayedComponents: .date)
            .datePickerStyle(.compact)
            .labelsHidden()
            TextField("学園祭振替 等", text: $reason)
                .textFieldStyle(.atender)
                .onChange(of: reason) { _, value in reason = String(value.prefix(100)) }
            AtenderButton(title: "追加", variant: .primary, isLoading: isPending, isEnabled: !date.isEmpty && !isPending) {
                Task { await add() }
            }
            if let errorMessage {
                Text(errorMessage).font(.atenderSm).foregroundStyle(Color.statusAbsent)
            }
        }
        .padding(Space.s4)
        .background(Color.bgElevated)
        .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
        .atenderShadow(.card)
        .task { await load() }
    }

    private func load() async {
        if let loaded = try? await environment.courseRepository.courseSuspensions(courseId: courseId, force: true) {
            suspensions = loaded.sorted { $0.date < $1.date }
        }
    }

    private func add() async {
        isPending = true
        defer { isPending = false }
        do {
            _ = try await environment.courseRepository.createCourseSuspension(courseId: courseId, date: date, reason: reason.trimmedNil)
            date = ""
            reason = ""
            await load()
        } catch {
            errorMessage = error.userFacingMessage
        }
    }

    private func delete(_ suspension: CourseSuspensionDto) async {
        do {
            try await environment.courseRepository.deleteCourseSuspension(courseId: courseId, id: suspension.id)
            await load()
        } catch {
            errorMessage = error.userFacingMessage
        }
    }
}

struct CourseOccurrenceHistory: View {
    let courseId: String
    let semesterId: String?
    @Environment(AppEnvironment.self) private var environment
    @State private var stat: CourseStatsDto?

    var body: some View {
        Group {
            if let stat {
                VStack(alignment: .leading, spacing: Space.s3) {
                    Text("出席履歴")
                        .font(.atenderBase.weight(.bold))
                        .foregroundStyle(Color.textPrimary)
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: Space.s2) {
                        statCell("出席", stat.counts.present, .statusPresent)
                        statCell("欠席", stat.counts.absent, .statusAbsent)
                        statCell("遅刻", stat.counts.tardy, .statusTardy)
                        statCell("早退", stat.counts.earlyLeave, .statusEarly)
                        statCell("公欠", stat.counts.excused, .statusExcused)
                        statCell("休講(個別)", stat.counts.cancelled, .statusCancelled)
                        statCell("休講(一括)", stat.counts.suspended, .statusSuspended)
                        statCell("未記録", stat.counts.unrecorded, .textTertiary)
                    }
                    Text("\(stat.effectiveNumerator.clean) / \(stat.effectiveDenominator.clean) = \(rateText(stat.attendanceRate))")
                        .font(.atenderSm)
                        .foregroundStyle(Color.textTertiary)
                }
                .padding(Space.s4)
                .background(Color.bgElevated)
                .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
                .atenderShadow(.card)
            }
        }
        .task { await load() }
    }

    private func statCell(_ label: String, _ value: Int, _ color: Color) -> some View {
        VStack(spacing: Space.s1) {
            Text(label).font(.atenderXs).foregroundStyle(Color.textTertiary)
            Text("\(value)").font(.atenderLg.weight(.black)).foregroundStyle(color)
        }
        .frame(maxWidth: .infinity)
        .padding(Space.s3)
        .background(Color.bgMuted)
        .clipShape(RoundedRectangle(cornerRadius: Radius.timetableCell, style: .continuous))
    }

    private func load() async {
        guard let semesterId else { return }
        if let overview = try? await environment.semesterRepository.semesterOverview(id: semesterId, force: true) {
            stat = overview.courses.first { $0.courseId == courseId }
        }
    }

    private func rateText(_ rate: Double?) -> String {
        guard let rate else { return "—" }
        return String(format: "%.1f%%", rate * 100)
    }
}

struct DangerZone: View {
    let courseId: String
    let onDeleted: () -> Void
    @Environment(AppEnvironment.self) private var environment
    @State private var confirming = false

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            Text("この科目を削除")
                .font(.atenderBase.weight(.bold))
                .foregroundStyle(Color.statusAbsent)
            Text("出席記録・休講日も全て削除されます。元に戻せません。")
                .font(.atenderSm)
                .foregroundStyle(Color.textSecondary)
            AtenderButton(title: "削除する", variant: .ghost) {
                confirming = true
            }
        }
        .padding(Space.s4)
        .background(Color.statusAbsent.opacity(0.05))
        .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).stroke(Color.statusAbsent.opacity(0.30), lineWidth: 1))
        .confirmDestructive("科目を削除", isPresented: $confirming, actionTitle: "削除する") {
            Task { await delete() }
        }
    }

    private func delete() async {
        do {
            try await environment.courseRepository.deleteCourse(id: courseId)
            onDeleted()
        } catch {
            environment.toastCenter.show("削除できませんでした")
        }
    }
}

private extension String {
    var trimmedNil: String? {
        let value = trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }
}
