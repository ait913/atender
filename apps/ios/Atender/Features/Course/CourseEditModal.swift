import SwiftUI

struct CourseEditModal: View {
    @Environment(AppEnvironment.self) private var environment
    @Binding var isPresented: Bool
    let timetableId: String
    var course: CourseDto?
    var stackLevel: Int = 1
    var onSaved: (CourseDto) -> Void

    @State private var name = ""
    @State private var teacher = ""
    @State private var color = "#10b981"
    @State private var note = ""
    @State private var rateOn = false
    @State private var rate = 70
    @State private var maxOn = false
    @State private var maxAbsences = 5
    @State private var tardyOn = false
    @State private var tardies = 3
    @State private var userRate = 70
    @State private var isPending = false
    @State private var error: String?
    private let colors = ["#12B172", "#56D8C3", "#568CFC", "#A978FA", "#FC6ABF", "#FD728E"]

    var body: some View {
        BottomSheet(title: course == nil ? "科目を追加" : "科目を編集", isPresented: $isPresented, stackLevel: stackLevel) {
            VStack(alignment: .leading, spacing: Space.s4) {
                field("科目名") { TextField("科目名", text: $name).textFieldStyle(.atender) }
                field("先生") { TextField("先生", text: $teacher).textFieldStyle(.atender) }
                field("色") {
                    HStack(spacing: Space.s3) {
                        ForEach(colors, id: \.self) { candidate in
                            Button { color = candidate } label: {
                                Circle()
                                    .fill(Color(hexString: candidate))
                                    .frame(width: 34, height: 34)
                                    .overlay(Circle().stroke(color == candidate ? Color.textPrimary : Color.clear, lineWidth: 2))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                field("メモ") {
                    TextField("メモ", text: $note, axis: .vertical)
                        .lineLimit(3...6)
                        .textFieldStyle(.atender)
                }
                field("出席の基準") { ruleCard }
                Text("回数は授業の回数です。同じ日のコマはまとめて 1 回と数えます。")
                    .font(.atenderXs).foregroundStyle(Color.textTertiary)
                    .padding(.top, -Space.s2)
                Text(CourseRuleLogic.footnote(rateOn: rateOn, maxOn: maxOn, userRate: userRate, rate: rate))
                    .font(.atenderXs).foregroundStyle(Color.textTertiary)
                    .padding(.top, -Space.s3)
                if let error {
                    Text(error).font(.atenderSm).foregroundStyle(Color.statusAbsent)
                }
            }
            .task { userRate = (try? await environment.meRepository.me())?.user.requiredAttendanceRate ?? 70 }
            .onAppear { initialize() }
            .onChange(of: isPresented) { _, open in if open { initialize() } }
        } footer: {
            HStack(spacing: Space.s3) {
                AtenderButton(title: "キャンセル", variant: .ghost) { isPresented = false }
                AtenderButton(title: "保存", variant: .primary, isLoading: isPending, isEnabled: canSave) {
                    Task { await save() }
                }
            }
        }
    }

    private var canSave: Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isPending
    }

    private func initialize() {
        name = course?.name ?? ""
        teacher = course?.teacher ?? ""
        color = course?.color ?? colors[0]
        note = course?.note ?? ""
        rateOn = course?.requiredAttendanceRate != nil
        rate = course?.requiredAttendanceRate ?? userRate
        maxOn = course?.maxAbsences != nil
        maxAbsences = course?.maxAbsences ?? 5
        tardyOn = course?.tardiesPerAbsence != nil
        tardies = course?.tardiesPerAbsence ?? 3
        error = nil
    }

    private var ruleCard: some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            Toggle("この科目の必要出席率を変える", isOn: $rateOn.animation())
                .accessibilityIdentifier("course-rule-rate-toggle")
                .onChange(of: rateOn) { _, on in if on && course?.requiredAttendanceRate == nil { rate = userRate } }
            if rateOn {
                HStack {
                    NumberStepper(value: $rate, min: 1, max: 100, label: "必要出席率")
                    Text("%").font(.atenderBase).foregroundStyle(Color.textSecondary)
                }
            }
            Divider()
            Toggle("欠席できる回数の上限を決める", isOn: $maxOn.animation())
                .accessibilityIdentifier("course-rule-max-absences-toggle")
            if maxOn {
                HStack {
                    NumberStepper(value: $maxAbsences, min: 0, max: 30, label: "欠席上限")
                    Text("回まで").font(.atenderBase).foregroundStyle(Color.textSecondary)
                }
            }
            Divider()
            Toggle("遅刻・早退を欠席に換算する", isOn: $tardyOn.animation())
                .accessibilityIdentifier("course-rule-tardy-toggle")
            if tardyOn {
                HStack {
                    NumberStepper(value: $tardies, min: 1, max: 10, label: "遅刻・早退の換算")
                    Text("回で欠席 1 回").font(.atenderBase).foregroundStyle(Color.textSecondary)
                }
            }
        }
        .padding(Space.s3)
        .background(Color.bgMuted)
        .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
    }

    private func save() async {
        guard canSave else { return }
        isPending = true
        defer { isPending = false }
        do {
            let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
            let trimmedTeacher = teacher.trimmingCharacters(in: .whitespacesAndNewlines)
            let trimmedNote = note.trimmingCharacters(in: .whitespacesAndNewlines)
            let saved: CourseDto
            if let course {
                saved = try await environment.timetableRepository.updateCourse(id: course.id, .init(
                    name: trimmedName,
                    teacher: trimmedTeacher.isEmpty ? nil : trimmedTeacher,
                    color: color,
                    note: trimmedNote.isEmpty ? nil : trimmedNote,
                    rule: CourseRuleValues(
                        requiredAttendanceRate: rateOn ? rate : nil,
                        maxAbsences: maxOn ? maxAbsences : nil,
                        tardiesPerAbsence: tardyOn ? tardies : nil
                    )
                ))
            } else {
                saved = try await environment.timetableRepository.createCourse(.init(
                    userTimetableId: timetableId,
                    name: trimmedName,
                    teacher: trimmedTeacher.isEmpty ? nil : trimmedTeacher,
                    color: color,
                    note: trimmedNote.isEmpty ? nil : trimmedNote,
                    requiredAttendanceRate: rateOn ? rate : nil,
                    maxAbsences: maxOn ? maxAbsences : nil,
                    tardiesPerAbsence: tardyOn ? tardies : nil
                ))
            }
            onSaved(saved)
            isPresented = false
        } catch {
            self.error = "保存できませんでした"
        }
    }

    private func field<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: Space.s2) {
            Text(title).font(.atenderSm).fontWeight(.bold).foregroundStyle(Color.textSecondary)
            content()
        }
    }
}
