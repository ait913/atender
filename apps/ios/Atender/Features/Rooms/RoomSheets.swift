import SwiftUI
import Observation
import UniformTypeIdentifiers

@MainActor
@Observable
final class RoomSettingsViewModel {
    @ObservationIgnored private let env: AppEnvironment
    let roomId: String
    private(set) var room: RoomDto?
    private(set) var members: [RoomMemberDto] = []
    private(set) var personalCalendarShare: PersonalCalendarShareDto?
    private(set) var meId: String?
    var isOwner: Bool { members.first { $0.userId == meId }?.role == .owner }

    init(env: AppEnvironment, roomId: String) {
        self.env = env
        self.roomId = roomId
    }

    func load() async {
        async let r = env.roomRepository.room(id: roomId, force: true)
        async let m = env.roomRepository.roomMembers(id: roomId, force: true)
        async let me = env.meRepository.me()
        async let share = env.apiClient.send(Endpoints.personalCalendarShare(roomId: roomId), as: PersonalCalendarShareResponse.self)
        room = try? await r
        members = (try? await m) ?? []
        meId = (try? await me)?.user.id
        personalCalendarShare = (try? await share)?.share
    }

    func persist(name: String? = nil, description: String? = nil, showMemberTimetables: Bool? = nil) async throws {
        _ = try await env.roomRepository.updateRoom(id: roomId, UpdateRoomInput(name: name, description: description, showMemberTimetables: showMemberTimetables))
    }

    func removeMember(_ userId: String) async throws { try await env.roomRepository.removeMember(id: roomId, userId: userId) }
    func regenerateInvite() async throws { _ = try await env.roomRepository.regenerateInvite(id: roomId) }
    func leave() async throws { try await env.roomRepository.leaveRoom(id: roomId) }
    func delete() async throws { try await env.roomRepository.deleteRoom(id: roomId) }
    func setPersonalCalendarShare(enabled: Bool, visibilityMode: VisibilityMode) async throws {
        if enabled {
            let response = try await env.apiClient.send(
                Endpoints.setPersonalCalendarShare(roomId: roomId, SharePutInput(visibilityMode: visibilityMode)),
                as: PersonalCalendarShareResponse.self
            )
            personalCalendarShare = response.share
        } else {
            try await env.apiClient.send(Endpoints.deletePersonalCalendarShare(roomId: roomId))
            personalCalendarShare = nil
        }
    }

    func patchPersonalCalendarShare(visibilityMode: VisibilityMode) async throws {
        let response = try await env.apiClient.send(
            Endpoints.patchPersonalCalendarShare(roomId: roomId, SharePatchInput(visibilityMode: visibilityMode, enabled: true)),
            as: PersonalCalendarShareResponse.self
        )
        personalCalendarShare = response.share
    }
}

struct RoomSettingsSheet: View {
    let roomId: String
    @Binding var isPresented: Bool
    let onChanged: () async -> Void
    @Environment(AppEnvironment.self) private var environment
    @Environment(AppRouter.self) private var router
    @State private var model: RoomSettingsViewModel?
    @State private var name = ""
    @State private var description = ""
    @State private var showMemberTimetables = true
    @State private var copyMessage: String?
    @State private var confirm: Confirm?
    @State private var importOpen = false
    @State private var ruleEditorOpen = false
    @State private var shareEnabled = false
    @State private var shareVisibility: VisibilityMode = .titleMapped
    @State private var lastSavedName = ""
    @State private var lastSavedDescription = ""
    @State private var skipDisappearPersist = false
    @FocusState private var focusedField: Field?

    enum Field { case name, description }
    enum Confirm: Identifiable {
        case removeMember(String), leave, delete
        var id: String {
            switch self {
            case .removeMember(let id): return "remove-\(id)"
            case .leave: return "leave"
            case .delete: return "delete"
            }
        }
    }

    var body: some View {
        SheetScaffold(title: "ルームの設定", isPresented: closeBinding) {
            VStack(alignment: .leading, spacing: Space.s5) {
                LabeledInput(label: "ルーム名", text: $name)
                    .focused($focusedField, equals: .name)
                    .disabled(model?.isOwner != true)
                LabeledInput(label: "説明", text: $description, axis: .vertical)
                    .focused($focusedField, equals: .description)
                    .disabled(model?.isOwner != true)
                Toggle("メンバー時間割を表示", isOn: Binding(get: { showMemberTimetables }, set: { value in
                    let previous = showMemberTimetables
                    showMemberTimetables = value
                    Task {
                        do {
                            try await model?.persist(showMemberTimetables: value)
                            await onChanged()
                        } catch {
                            showMemberTimetables = previous
                            environment.toastCenter.show("保存できませんでした、もう一度試してください")
                        }
                    }
                }))
                .disabled(model?.isOwner != true)
                memberSection
                personalCalendarShareSection
                icsSection
                if model?.isOwner == true { inviteSection }
            }
        } footer: {
            if model?.isOwner == true {
                AtenderButton(title: "ルームを削除", variant: .destructive) { confirm = .delete }
            } else {
                AtenderButton(title: "退出する", variant: .ghost) { confirm = .leave }
            }
        }
        .accessibilityIdentifier("room-settings-sheet")
        .task {
            if model == nil { model = RoomSettingsViewModel(env: environment, roomId: roomId) }
            await model?.load()
            if let room = model?.room {
                name = room.name
                description = room.description ?? ""
                lastSavedName = name
                lastSavedDescription = description
                showMemberTimetables = room.showMemberTimetables
            }
            if let share = model?.personalCalendarShare {
                shareEnabled = share.enabled
                shareVisibility = share.visibilityMode
            } else {
                shareEnabled = false
                shareVisibility = .titleMapped
            }
        }
        .onChange(of: focusedField) { old, new in
            guard old != nil, new == nil, model?.isOwner == true else { return }
            Task {
                await persistRoomDetailsIfNeeded()
            }
        }
        .onDisappear {
            guard !skipDisappearPersist else { return }
            Task { await persistRoomDetailsIfNeeded() }
        }
        .confirmationDialog(confirmTitle, isPresented: Binding(get: { confirm != nil }, set: { if !$0 { confirm = nil } }), titleVisibility: .visible) {
            Button(confirmButtonTitle, role: .destructive) {
                let pending = confirm
                Task { await performConfirm(pending) }
            }
            Button("キャンセル", role: .cancel) { confirm = nil }
        }
        .sheet(isPresented: $importOpen) {
            IcsImportWizard(roomId: roomId, isPresented: $importOpen) {
                await onChanged()
            }
        }
        .sheet(isPresented: $ruleEditorOpen) {
            IcsTitleRuleEditorSheet(isPresented: $ruleEditorOpen)
        }
    }

    private var closeBinding: Binding<Bool> {
        Binding(
            get: { isPresented },
            set: { value in
                guard !value else {
                    isPresented = true
                    return
                }
                Task {
                    await persistRoomDetailsIfNeeded()
                    isPresented = false
                }
            }
        )
    }

    private var memberSection: some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            Text("メンバー (\(model?.members.count ?? 0))")
                .font(.atenderSm)
                .fontWeight(.semibold)
                .foregroundStyle(Color.textSecondary)
            ForEach(model?.members ?? []) { member in
                HStack(spacing: Space.s3) {
                    Text(String((member.name ?? member.handle ?? "?").prefix(1)).uppercased())
                        .font(.atenderSm)
                        .fontWeight(.bold)
                        .foregroundStyle(Color.white)
                        .frame(width: 36, height: 36)
                        .background(Color(hexString: MemberColor.memberColor(member.userId)))
                        .clipShape(Circle())
                    VStack(alignment: .leading, spacing: 2) {
                        Text(member.name ?? "No name").font(.atenderSm).fontWeight(.bold).foregroundStyle(Color.textPrimary)
                        Text("@\(member.handle ?? String(member.userId.prefix(8))) · \(member.role == .owner ? "オーナー" : "メンバー")")
                            .font(.atenderXs)
                            .foregroundStyle(Color.textTertiary)
                    }
                    Spacer()
                    if model?.isOwner == true, member.userId != model?.meId, member.role != .owner {
                        AtenderButton(title: "追放", variant: .ghost, size: .sm) { confirm = .removeMember(member.userId) }
                            .fixedSize()
                    }
                }
            }
        }
    }

    private var icsSection: some View {
        VStack(alignment: .leading, spacing: Space.s2) {
            Text("外部カレンダー取込").font(.atenderSm).fontWeight(.semibold).foregroundStyle(Color.textSecondary)
            Text("ICS ファイルからルーム予定を取り込みます。").font(.atenderXs).foregroundStyle(Color.textTertiary)
            AtenderButton(title: "取り込み画面を開く", variant: .secondary) { importOpen = true }
        }
    }

    private var personalCalendarShareSection: some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            Text("自分のカレンダーを共有").font(.atenderSm).fontWeight(.semibold).foregroundStyle(Color.textSecondary)
            Toggle("共有する", isOn: Binding(get: { shareEnabled }, set: { value in
                let previous = shareEnabled
                shareEnabled = value
                Task {
                    do {
                        try await model?.setPersonalCalendarShare(enabled: value, visibilityMode: shareVisibility)
                        await onChanged()
                    } catch {
                        shareEnabled = previous
                        environment.toastCenter.show("保存できませんでした、もう一度試してください")
                    }
                }
            }))
            Picker("表示モード", selection: Binding(get: { shareVisibility }, set: { value in
                let previous = shareVisibility
                shareVisibility = value
                guard shareEnabled else { return }
                Task {
                    do {
                        try await model?.patchPersonalCalendarShare(visibilityMode: value)
                        await onChanged()
                    } catch {
                        shareVisibility = previous
                        environment.toastCenter.show("保存できませんでした、もう一度試してください")
                    }
                }
            })) {
                Text("そのまま").tag(VisibilityMode.normal)
                Text("マスキング").tag(VisibilityMode.titleMapped)
                Text("予定のみ").tag(VisibilityMode.busyOnly)
            }
            .pickerStyle(.segmented)
            .disabled(!shareEnabled)
            if shareEnabled && shareVisibility == .titleMapped {
                AtenderButton(title: "マスクルールを編集", variant: .secondary, size: .sm) {
                    ruleEditorOpen = true
                }
            }
        }
    }

    private var inviteSection: some View {
        let inviteCode = model?.room?.inviteCode
        let link = InviteURL.room(inviteCode: inviteCode ?? "")
        return VStack(alignment: .leading, spacing: Space.s3) {
            Text("招待リンク").font(.atenderSm).fontWeight(.semibold).foregroundStyle(Color.textSecondary)
            if inviteCode != nil {
                InviteQRView(urlString: link)
            } else {
                InviteQRView(urlString: "")
                    .redacted(reason: .placeholder)
            }
            Text(link).font(.atenderXs).foregroundStyle(Color.textTertiary)
            if let copyMessage { Text(copyMessage).font(.atenderXs).foregroundStyle(Color.accent500) }
            HStack(spacing: Space.s3) {
                AtenderButton(title: "リンクをコピー", variant: .secondary, size: .sm) {
                    UIPasteboard.general.string = link
                    copyMessage = "コピーしました"
                }
                if let url = URL(string: link) {
                    ShareLink("共有", item: url)
                        .font(.atenderSm)
                }
                AtenderButton(title: "再発行", variant: .ghost, size: .sm) {
                    Task {
                        do {
                            try await model?.regenerateInvite()
                            await model?.load()
                            await onChanged()
                        } catch {
                            environment.toastCenter.show("保存できませんでした、もう一度試してください")
                        }
                    }
                }
            }
        }
    }

    private var confirmTitle: String {
        switch confirm {
        case .removeMember: return "メンバーを追放しますか？"
        case .leave: return "ルームを退出しますか？"
        case .delete: return "ルームを削除しますか？"
        case nil: return ""
        }
    }

    private var confirmButtonTitle: String {
        switch confirm {
        case .removeMember: return "追放"
        case .leave: return "退出"
        case .delete: return "削除"
        case nil: return ""
        }
    }

    private func persistRoomDetailsIfNeeded() async {
        guard model?.isOwner == true else { return }
        guard name != lastSavedName || description != lastSavedDescription else { return }
        do {
            try await model?.persist(name: name, description: description.isEmpty ? nil : description)
            lastSavedName = name
            lastSavedDescription = description
            await onChanged()
        } catch {
            environment.toastCenter.show("保存できませんでした、もう一度試してください")
        }
    }

    private func performConfirm(_ pending: Confirm?) async {
        switch pending {
        case .removeMember(let userId):
            do {
                try await model?.removeMember(userId)
                await model?.load()
                await onChanged()
            } catch {
                environment.toastCenter.show("削除できませんでした")
            }
        case .leave:
            do {
                try await model?.leave()
                await onChanged()
                skipDisappearPersist = true
                isPresented = false
                router.roomsPath = NavigationPath()
            } catch {
                environment.toastCenter.show("退出できませんでした")
            }
        case .delete:
            do {
                try await model?.delete()
                await onChanged()
                skipDisappearPersist = true
                isPresented = false
                router.roomsPath = NavigationPath()
            } catch {
                environment.toastCenter.show("削除できませんでした")
            }
        case nil:
            break
        }
        confirm = nil
    }
}

struct RoomEventCreateSheet: View {
    let roomId: String
    let defaultDate: String
    @Binding var isPresented: Bool
    let onCreated: () async -> Void
    @Environment(AppEnvironment.self) private var environment
    @State private var title = ""
    @State private var start: Date
    @State private var end: Date
    @State private var rrule: String?
    @State private var visibility: VisibilityMode = .normal
    @State private var isPending = false

    init(roomId: String, defaultDate: String, isPresented: Binding<Bool>, onCreated: @escaping () async -> Void) {
        self.roomId = roomId
        self.defaultDate = defaultDate
        self._isPresented = isPresented
        self.onCreated = onCreated
        let base = CalendarRange.parse(defaultDate) ?? Date()
        _start = State(initialValue: base)
        _end = State(initialValue: Calendar.current.date(byAdding: .hour, value: 1, to: base) ?? base)
    }

    var body: some View {
        SheetScaffold(title: "予定を追加", isPresented: $isPresented) {
            VStack(alignment: .leading, spacing: Space.s4) {
                LabeledInput(label: "タイトル", text: $title)
                DatePicker("開始", selection: $start, displayedComponents: [.date, .hourAndMinute])
                DatePicker("終了", selection: $end, displayedComponents: [.date, .hourAndMinute])
                RecurrencePicker(rrule: $rrule, start: start)
                Picker("表示モード", selection: $visibility) {
                    Text("通常").tag(VisibilityMode.normal)
                    Text("タイトル隠す").tag(VisibilityMode.titleMapped)
                    Text("予定ありのみ").tag(VisibilityMode.busyOnly)
                }
            }
        } footer: {
            AtenderButton(title: "保存", variant: .primary, isLoading: isPending, isEnabled: !title.isEmpty && !isPending) {
                Task {
                    isPending = true
                    defer { isPending = false }
                    do {
                        _ = try await environment.roomEventRepository.createRoomEvent(roomId: roomId, CreateRoomEventInput(
                            title: title,
                            description: nil,
                            start: iso(start),
                            end: iso(end),
                            isAllDay: false,
                            color: nil,
                            recurrence: rrule.map { .init(rrule: $0, exDates: [], rDates: []) },
                            visibilityMode: visibility
                        ))
                        await onCreated()
                        isPresented = false
                    } catch {
                        environment.toastCenter.show("保存できませんでした、もう一度試してください")
                    }
                }
            }
        }
    }

    private func iso(_ date: Date) -> String {
        ISO8601DateFormatter().string(from: date)
    }
}

struct RoomEventEditSheet: View {
    let roomId: String
    let event: RoomEventDto
    @Binding var isPresented: Bool
    let onChanged: () async -> Void
    @Environment(AppEnvironment.self) private var environment
    @State private var title: String
    @State private var start: Date
    @State private var end: Date
    @State private var rrule: String?
    @State private var visibility: VisibilityMode
    @State private var isPending = false
    @State private var confirmDelete = false

    init(roomId: String, event: RoomEventDto, isPresented: Binding<Bool>, onChanged: @escaping () async -> Void) {
        self.roomId = roomId
        self.event = event
        self._isPresented = isPresented
        self.onChanged = onChanged
        let parsedStart = Self.parseISO(event.start) ?? Date()
        let parsedEnd = Self.parseISO(event.end) ?? Calendar.current.date(byAdding: .hour, value: 1, to: parsedStart) ?? parsedStart
        _title = State(initialValue: event.title)
        _start = State(initialValue: parsedStart)
        _end = State(initialValue: parsedEnd)
        _rrule = State(initialValue: event.recurrenceRule)
        _visibility = State(initialValue: event.visibilityMode)
    }

    var body: some View {
        SheetScaffold(title: "予定を編集", isPresented: $isPresented) {
            VStack(alignment: .leading, spacing: Space.s4) {
                LabeledInput(label: "タイトル", text: $title)
                DatePicker("開始", selection: $start, displayedComponents: [.date, .hourAndMinute])
                DatePicker("終了", selection: $end, displayedComponents: [.date, .hourAndMinute])
                RecurrencePicker(rrule: $rrule, start: start)
                Picker("表示モード", selection: $visibility) {
                    Text("通常").tag(VisibilityMode.normal)
                    Text("タイトル隠す").tag(VisibilityMode.titleMapped)
                    Text("予定ありのみ").tag(VisibilityMode.busyOnly)
                }
            }
        } footer: {
            VStack(spacing: Space.s3) {
                AtenderButton(title: "保存", variant: .primary, isLoading: isPending, isEnabled: !title.isEmpty && !isPending) {
                    Task { await save() }
                }
                AtenderButton(title: "削除", variant: .destructive, isEnabled: !isPending) {
                    confirmDelete = true
                }
            }
        }
        .confirmationDialog("予定を削除しますか？", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("削除", role: .destructive) {
                Task { await delete() }
            }
            Button("キャンセル", role: .cancel) {}
        }
    }

    private func save() async {
        isPending = true
        defer { isPending = false }
        do {
            _ = try await environment.roomEventRepository.updateRoomEvent(roomId: roomId, eventId: event.id, UpdateRoomEventInput(
                title: title,
                description: event.description,
                start: iso(start),
                end: iso(end),
                isAllDay: event.isAllDay,
                color: event.color,
                recurrence: rrule.map { .init(rrule: $0, exDates: [], rDates: []) },
                visibilityMode: visibility,
                editScope: "all",
                originalDate: nil
            ))
            await onChanged()
            isPresented = false
        } catch {
            environment.toastCenter.show("保存できませんでした、もう一度試してください")
        }
    }

    private func delete() async {
        isPending = true
        defer { isPending = false }
        do {
            try await environment.roomEventRepository.deleteRoomEvent(roomId: roomId, eventId: event.id, scope: "all")
            await onChanged()
            isPresented = false
        } catch {
            environment.toastCenter.show("削除できませんでした")
        }
    }

    private func iso(_ date: Date) -> String {
        ISO8601DateFormatter().string(from: date)
    }

    private static func parseISO(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        return fractional.date(from: value) ?? plain.date(from: value)
    }
}

struct RecurrencePicker: View {
    @Binding var rrule: String?
    let start: Date
    @State private var preset = "none"
    private let presets = ["none", "daily", "weekly", "weekday", "monthly_bymonthday", "monthly_byday", "yearly"]

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s2) {
            Picker("繰り返し", selection: Binding(get: { preset }, set: { value in
                preset = value
                rrule = RecurrencePresetLogic.presetToRRule(value, start: start)
            })) {
                ForEach(presets, id: \.self) { value in
                    Text(RecurrencePresetLogic.presetLabel(value, start: start)).tag(value)
                }
            }
            if rrule != nil {
                Text(RecurrencePresetLogic.recurrenceToText(rrule, start: start))
                    .font(.atenderXs)
                    .foregroundStyle(Color.textSecondary)
            }
        }
        .onAppear { preset = RecurrencePresetLogic.currentPreset(rrule, start: start) }
        .onChange(of: start) { _, value in
            preset = RecurrencePresetLogic.currentPreset(rrule, start: value)
        }
    }
}

struct IcsImportWizard: View {
    let roomId: String
    @Binding var isPresented: Bool
    var onCommitted: (() async -> Void)? = nil
    @Environment(AppEnvironment.self) private var environment
    @State private var step: Step = .upload
    @State private var importId: String?
    @State private var preview: IcsImportPreview?
    @State private var commitResult: IcsImportCommitResult?
    @State private var errorText: String?
    @State private var fileImporterOpen = false

    enum Step { case upload, preview, committing, done, error }

    var body: some View {
        SheetScaffold(title: "カレンダーを取り込む", isPresented: $isPresented) {
            content
        } footer: {
            footer
        }
        .accessibilityIdentifier("ics-wizard")
        .fileImporter(isPresented: $fileImporterOpen, allowedContentTypes: [UTType(filenameExtension: "ics") ?? .data, UTType("text/calendar") ?? .data]) { result in
            Task { await handleFile(result) }
        }
        .onChange(of: isPresented) { _, value in
            if !value { reset() }
        }
    }

    @ViewBuilder private var content: some View {
        switch step {
        case .upload:
            Button {
                fileImporterOpen = true
            } label: {
                VStack(spacing: Space.s3) {
                    Image(systemName: "doc.badge.plus").font(.atender2xl)
                    Text("ファイルを選択")
                    Text(".ics, 5MB まで").font(.atenderXs).foregroundStyle(Color.textTertiary)
                }
                .frame(maxWidth: .infinity, minHeight: 180)
                .overlay(RoundedRectangle(cornerRadius: Radius.md).stroke(Color.borderDefault, style: StrokeStyle(lineWidth: 1, dash: [6])))
            }
            .buttonStyle(.plain)
        case .preview:
            if let preview {
                VStack(alignment: .leading, spacing: Space.s3) {
                    Text("\(preview.events.count) 件のイベントが見つかりました").font(.atenderBase).fontWeight(.bold)
                    ForEach(preview.events.prefix(10)) { item in
                        Text("\(RoomEventTiming.format(item.start, pattern: "M/d HH:mm"))  \"\(item.rawTitle)\" → \"\(item.mappedTitle)\"")
                            .font(.atenderXs)
                            .foregroundStyle(Color.textSecondary)
                    }
                }
            } else {
                VStack(spacing: Space.s3) { ForEach(0..<4, id: \.self) { _ in Skeleton(width: nil, height: 36, radius: Radius.md) } }
                    .task { await loadPreview() }
            }
        case .committing:
            Skeleton(width: nil, height: 80, radius: Radius.md)
                .task { await commit() }
        case .done:
            VStack(alignment: .leading, spacing: Space.s3) {
                Text("\(commitResult?.committed ?? 0) 件取り込み、\(commitResult?.skipped ?? 0) 件スキップ")
                    .font(.atenderBase)
                    .fontWeight(.bold)
                ForEach(commitResult?.errors ?? [], id: \.self) { error in
                    Text(error).font(.atenderXs).foregroundStyle(Color.statusAbsent)
                }
            }
        case .error:
            Text(errorText ?? "取り込みに失敗しました")
                .font(.atenderSm)
                .foregroundStyle(Color.statusAbsent)
        }
    }

    @ViewBuilder private var footer: some View {
        switch step {
        case .upload:
            EmptyView()
        case .preview:
            HStack(spacing: Space.s3) {
                AtenderButton(title: "もう一度", variant: .ghost) { step = .upload; preview = nil; importId = nil }
                AtenderButton(title: "取り込む", variant: .primary, isEnabled: preview != nil) { step = .committing }
            }
        case .committing:
            EmptyView()
        case .done:
            AtenderButton(title: "閉じる", variant: .primary) {
                Task {
                    await onCommitted?()
                    isPresented = false
                }
            }
        case .error:
            AtenderButton(title: "戻る", variant: .primary) { step = .upload }
        }
    }

    private func handleFile(_ result: Result<URL, Error>) async {
        do {
            let url = try result.get()
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            let data = try Data(contentsOf: url)
            let response = try await environment.icsImportRepository.upload(roomId: roomId, fileData: data, filename: url.lastPathComponent)
            importId = response.import.id
            preview = nil
            step = .preview
        } catch {
            errorText = error.userFacingMessage
            step = .error
        }
    }

    private func loadPreview() async {
        guard let importId else { return }
        do {
            preview = try await environment.icsImportRepository.preview(roomId: roomId, importId: importId, force: true)
        } catch {
            errorText = error.userFacingMessage
            step = .error
        }
    }

    private func commit() async {
        guard let importId else { return }
        do {
            commitResult = try await environment.icsImportRepository.commit(roomId: roomId, importId: importId)
            step = .done
        } catch {
            errorText = error.userFacingMessage
            step = .error
        }
    }

    private func reset() {
        step = .upload
        importId = nil
        preview = nil
        commitResult = nil
        errorText = nil
    }
}
