import SwiftUI

struct TimetableSettingsSheet: View {
    @Environment(AppEnvironment.self) private var environment
    @Binding var isPresented: Bool
    let timetable: UserTimetableDto?
    let semesterId: String?
    var onSaved: (() -> Void)?

    struct SlotInput: Identifiable, Equatable {
        var id: Int { periodIndex }
        var periodIndex: Int
        var label: String
        var startMinute: Int
        var endMinute: Int
        var isBreak: Bool
    }

    @State private var name = ""
    @State private var publishEnabled = false
    @State private var publishTitle = ""
    @State private var daysOfWeek: [Int] = [1, 2, 3, 4, 5]
    @State private var slots: [SlotInput] = []
    @State private var message: String?
    @State private var isPending = false
    @State private var navigationPath = NavigationPath()
    @State private var templateScope: TemplateScope?
    @State private var confirmingDelete = false

    private enum Route: Hashable { case templates }

    var body: some View {
        BottomSheet(title: "時間割の設定", isPresented: $isPresented, navigationPath: $navigationPath) {
            VStack(alignment: .leading, spacing: Space.s4) {
                if timetable == nil {
                    Text("先に学期を作成してください。")
                        .font(.atenderSm)
                        .foregroundStyle(Color.textSecondary)
                        .padding(Space.s3)
                        .background(Color.bgMuted)
                        .clipShape(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
                }
                field("名前") { TextField("名前", text: $name).textFieldStyle(.atender).disabled(timetable == nil) }
                field("表示する曜日") { DayChips(value: $daysOfWeek, disabled: timetable == nil) }
                field("時限 (\(slots.count) 限)") {
                    VStack(spacing: Space.s2) {
                        ForEach($slots) { $slot in
                            HStack(spacing: Space.s2) {
                                TextField("ラベル", text: $slot.label)
                                    .textFieldStyle(.atender)
                                    .frame(width: 64)
                                timeField($slot.startMinute)
                                Text("–").foregroundStyle(Color.textTertiary)
                                timeField($slot.endMinute)
                                Button {
                                    removeSlot(slot.periodIndex)
                                } label: {
                                    Image(systemName: "xmark")
                                        .foregroundStyle(Color.textTertiary)
                                        .frame(width: 32, height: 32)
                                }
                            }
                        }
                        Button(action: addSlot) {
                            Label("コマを追加", systemImage: "plus")
                                .font(.atenderSm)
                                .fontWeight(.bold)
                        }
                    }
                    .disabled(timetable == nil)
                }
                Toggle("みんなの時間割で公開", isOn: $publishEnabled)
                    .font(.atenderBase)
                    .disabled(timetable == nil)
                if timetable?.meetings.isEmpty == true {
                    Text("授業を 1 つ以上登録すると公開されます")
                        .font(.atenderSm)
                        .foregroundStyle(Color.textSecondary)
                }
                if publishEnabled {
                    field("公開タイトル") { TextField("公開タイトル", text: $publishTitle).textFieldStyle(.atender).disabled(timetable == nil) }
                }
                AtenderButton(title: "公開時間割から取り込む", variant: .secondary) {
                    Task { await openTemplateBrowser() }
                }
                .accessibilityIdentifier("timetable-settings-import-template")
                if let message {
                    Text(message)
                        .font(.atenderSm)
                        .foregroundStyle(message.contains("できません") || message.contains("してください") ? Color.statusAbsent : Color.textSecondary)
                }
                if timetable != nil {
                    timetableDangerZone
                }
            }
            .navigationDestination(for: Route.self) { _ in
                if let templateScope {
                    TemplateBrowser(
                        purpose: .importInto(initialSemesterId: semesterId, lockSemester: true),
                        showsFoundBanner: false,
                        initialScope: templateScope,
                        onImported: { _ in
                            onSaved?()
                            isPresented = false
                        },
                        onSelected: { _ in },
                        onClose: { isPresented = false }
                    )
                }
            }
            .onAppear { initialize() }
            .onChange(of: isPresented) { _, open in if open { initialize() } }
        } footer: {
            HStack(spacing: Space.s3) {
                AtenderButton(title: "キャンセル", variant: .ghost) {
                    initialize()
                    isPresented = false
                }
                AtenderButton(title: "保存", variant: .primary, isLoading: isPending, isEnabled: timetable != nil && !isPending) {
                    Task { await save() }
                }
            }
        }
    }

    private var timetableDangerZone: some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            Text("この時間割を削除")
                .font(.atenderBase.weight(.bold))
                .foregroundStyle(Color.statusAbsent)
            Text("授業・出席記録も全て削除されます。元に戻せません。")
                .font(.atenderSm)
                .foregroundStyle(Color.textSecondary)
            AtenderButton(title: "削除する", variant: .ghost) {
                confirmingDelete = true
            }
        }
        .padding(Space.s4)
        .background(Color.statusAbsent.opacity(0.05))
        .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).stroke(Color.statusAbsent.opacity(0.30), lineWidth: 1))
        .confirmDestructive("時間割を削除", isPresented: $confirmingDelete, actionTitle: "削除する") {
            Task { await deleteTimetable() }
        }
    }

    private func initialize() {
        publishEnabled = TimetablePublishLogic.initialToggle(timetable)
        guard let timetable else { return }
        name = timetable.title
        publishTitle = timetable.publishedTemplate?.title ?? timetable.title
        daysOfWeek = timetable.daysOfWeek
        slots = timetable.daySlots.sorted { $0.periodIndex < $1.periodIndex }.map {
            .init(periodIndex: $0.periodIndex, label: $0.label, startMinute: $0.startMinute, endMinute: $0.endMinute, isBreak: $0.isBreak)
        }
        message = nil
    }

    private func save() async {
        guard let timetable else { return }
        guard !daysOfWeek.isEmpty else {
            message = "表示する曜日を1つ以上選んでください"
            return
        }
        for (index, slot) in slots.enumerated() where slot.endMinute <= slot.startMinute {
            message = "\(index + 1) 限目: 終了時刻は開始時刻より後にしてください"
            return
        }
        isPending = true
        defer { isPending = false }
        do {
            if name != timetable.title {
                _ = try await environment.timetableRepository.patchUserTimetable(id: timetable.id, .init(title: name, daysOfWeek: nil, daySlots: nil, courses: nil, meetings: nil))
            }
            if daysOfWeek.sorted() != timetable.daysOfWeek.sorted() {
                _ = try await environment.timetableRepository.patchUserTimetable(id: timetable.id, .init(title: nil, daysOfWeek: daysOfWeek.sorted(), daySlots: nil, courses: nil, meetings: nil))
            }
            let nextSlots = slots.map { TemplateCreateInput.DaySlotCreateInput(periodIndex: $0.periodIndex, label: $0.label, startMinute: $0.startMinute, endMinute: $0.endMinute, isBreak: $0.isBreak) }
            let oldSlots = timetable.daySlots.map { TemplateCreateInput.DaySlotCreateInput(periodIndex: $0.periodIndex, label: $0.label, startMinute: $0.startMinute, endMinute: $0.endMinute, isBreak: $0.isBreak) }
            if nextSlots != oldSlots {
                _ = try await environment.timetableRepository.patchUserTimetable(id: timetable.id, .init(title: nil, daysOfWeek: nil, daySlots: nextSlots, courses: nil, meetings: nil))
            }
            do {
                switch TimetablePublishLogic.action(toggle: publishEnabled, title: publishTitle.trimmingCharacters(in: .whitespacesAndNewlines), timetable: timetable) {
                case .none:
                    break
                case .publish(let title):
                    guard !title.isEmpty else {
                        message = "公開タイトルを入力してください"
                        return
                    }
                    _ = try await environment.timetableRepository.publishAsTemplate(id: timetable.id, title: title)
                case .unpublish(let templateId):
                    try await environment.timetableRepository.unpublishTemplate(id: templateId)
                }
            } catch {
                message = "公開設定を保存できませんでした"
                return
            }
            onSaved?()
            isPresented = false
        } catch {
            message = "保存できませんでした"
        }
    }

    private func addSlot() {
        let last = slots.last
        let nextIndex = slots.count + 1
        let start = (last?.endMinute ?? 540) + 10
        slots.append(.init(periodIndex: nextIndex, label: "\(nextIndex)限", startMinute: start, endMinute: start + 100, isBreak: false))
    }

    private func removeSlot(_ periodIndex: Int) {
        slots.removeAll { $0.periodIndex == periodIndex }
        slots = slots.enumerated().map { index, slot in
            .init(periodIndex: index + 1, label: slot.label, startMinute: slot.startMinute, endMinute: slot.endMinute, isBreak: slot.isBreak)
        }
    }

    private func openTemplateBrowser() async {
        do {
            let me = try await environment.meRepository.me()
            guard let schoolId = me.user.schoolId, let departmentId = me.user.departmentId else {
                message = "先に学校・学科を設定してください"
                return
            }
            templateScope = TemplateScope(schoolId: schoolId, departmentId: departmentId,
                                          schoolName: me.user.schoolName ?? "未設定",
                                          departmentName: me.user.departmentName ?? "未設定")
            if navigationPath.isEmpty { navigationPath.append(Route.templates) }
        } catch {
            message = "公開時間割を読み込めませんでした"
        }
    }

    private func deleteTimetable() async {
        guard let id = timetable?.id else { return }
        do {
            try await environment.timetableRepository.deleteUserTimetable(id: id)
            onSaved?()
            isPresented = false
        } catch {
            environment.toastCenter.show("削除できませんでした")
        }
    }

    private func timeField(_ minutes: Binding<Int>) -> some View {
        TextField("HH:mm", text: Binding(
            get: { TimeFormatting.minutesToTime(minutes.wrappedValue) },
            set: { if let value = TimeFormatting.hhmmToMinutes($0) { minutes.wrappedValue = value } }
        ))
        .textFieldStyle(.atender)
        .keyboardType(.numbersAndPunctuation)
        .frame(width: 72)
    }

    private func field<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: Space.s2) {
            Text(title).font(.atenderSm).fontWeight(.bold).foregroundStyle(Color.textSecondary)
            content()
        }
    }
}
