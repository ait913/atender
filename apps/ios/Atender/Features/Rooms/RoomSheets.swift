import SwiftUI
import Observation

@MainActor
@Observable
final class RoomSettingsViewModel {
    @ObservationIgnored private let env: AppEnvironment
    let roomId: String
    private(set) var room: RoomDto?
    private(set) var members: [RoomMemberDto] = []
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
        room = try? await r
        members = (try? await m) ?? []
        meId = (try? await me)?.user.id
    }

    func persist(name: String? = nil, description: String? = nil, showMemberTimetables: Bool? = nil) async throws {
        _ = try await env.roomRepository.updateRoom(id: roomId, UpdateRoomInput(name: name, description: description, showMemberTimetables: showMemberTimetables))
    }

    func removeMember(_ userId: String) async throws { try await env.roomRepository.removeMember(id: roomId, userId: userId) }
    func regenerateInvite() async throws { _ = try await env.roomRepository.regenerateInvite(id: roomId) }
    func leave() async throws { try await env.roomRepository.leaveRoom(id: roomId) }
    func delete() async throws { try await env.roomRepository.deleteRoom(id: roomId) }
}

struct RoomSettingsSheet: View {
    let roomId: String
    @Binding var isPresented: Bool
    let onChanged: () async -> Void
    var onRemoved: (() -> Void)? = nil
    @Environment(AppEnvironment.self) private var environment
    @State private var model: RoomSettingsViewModel?
    @State private var name = ""
    @State private var description = ""
    @State private var showMemberTimetables = true
    @State private var copyMessage: String?
    @State private var confirm: Confirm?
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
                onRemoved?()
            } catch {
                environment.toastCenter.show("退出できませんでした")
            }
        case .delete:
            do {
                try await model?.delete()
                await onChanged()
                skipDisappearPersist = true
                isPresented = false
                onRemoved?()
            } catch {
                environment.toastCenter.show("削除できませんでした")
            }
        case nil:
            break
        }
        confirm = nil
    }
}
