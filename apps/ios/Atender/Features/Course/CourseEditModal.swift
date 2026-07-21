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
                if let error {
                    Text(error).font(.atenderSm).foregroundStyle(Color.statusAbsent)
                }
            }
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
        error = nil
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
                    note: trimmedNote.isEmpty ? nil : trimmedNote
                ))
            } else {
                saved = try await environment.timetableRepository.createCourse(.init(
                    userTimetableId: timetableId,
                    name: trimmedName,
                    teacher: trimmedTeacher.isEmpty ? nil : trimmedTeacher,
                    color: color,
                    note: trimmedNote.isEmpty ? nil : trimmedNote
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
