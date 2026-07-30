import SwiftUI
import Observation

@MainActor
@Observable
final class FriendsViewModel {
    @ObservationIgnored private let env: AppEnvironment
    private(set) var friendships: [FriendshipDto] = []
    private(set) var meId: String?
    private(set) var isLoading = false

    enum FriendshipActionKind: String {
        case accept, decline, cancel, block, delete
    }

    init(env: AppEnvironment) {
        self.env = env
    }

    func load(force: Bool = false) async {
        isLoading = true
        defer { isLoading = false }
        async let f = env.friendshipRepository.friendships(force: force)
        async let me = env.meRepository.me()
        friendships = (try? await f) ?? []
        meId = (try? await me)?.user.id
    }

    func act(_ action: FriendshipActionKind, id: String) async {
        try? await env.friendshipRepository.action(action.rawValue, id: id)
        await load(force: true)
    }
}

struct FriendsView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var model: FriendsViewModel?
    @State private var addOpen = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Space.s6) {
                if let model { content(model) }
            }
            .padding(Space.pagePxMobile)
        }
        .background(Color.bgBase)
        .navigationTitle("友達")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { addOpen = true } label: { Image(systemName: "person.badge.plus") }
                    .accessibilityLabel("友達を追加")
                    .accessibilityIdentifier("friends-add")
            }
        }
        .task {
            if model == nil { model = FriendsViewModel(env: environment) }
            await model?.load()
        }
        .sheet(isPresented: $addOpen) {
            AddFriendSheet(isPresented: $addOpen) {
                await model?.load(force: true)
            }
        }
    }

    @ViewBuilder
    private func content(_ model: FriendsViewModel) -> some View {
        let buckets = FriendshipBuckets.split(model.friendships, meId: model.meId)
        if model.isLoading {
            VStack(spacing: Space.s3) { ForEach(0..<4, id: \.self) { _ in Skeleton(width: nil, height: 88, radius: Radius.lg) } }
        } else if buckets.received.isEmpty && buckets.sent.isEmpty && buckets.accepted.isEmpty && buckets.blocked.isEmpty {
            EmptyState(title: "まだ友達がいません", message: "ハンドル検索または招待リンクで追加できます。")
        } else {
            VStack(alignment: .leading, spacing: Space.s5) {
                section("受信した申請", items: buckets.received, variant: .received, model: model)
                section("送信した申請", items: buckets.sent, variant: .sent, model: model)
                section("友達", items: buckets.accepted, variant: .accepted, model: model)
                if !buckets.blocked.isEmpty {
                    section("ブロック中", items: buckets.blocked, variant: .blocked, model: model)
                }
            }
            .accessibilityIdentifier("friends-list")
        }
    }

    private func section(_ title: String, items: [FriendshipDto], variant: FriendCard.Variant, model: FriendsViewModel) -> some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            Text("\(title) (\(items.count))")
                .font(.atenderSm)
                .fontWeight(.semibold)
                .foregroundStyle(Color.textSecondary)
            ForEach(items) { friendship in
                FriendCard(friendship: friendship, meId: model.meId, variant: variant) {
                    Task { await model.act(.accept, id: friendship.id) }
                } onDecline: {
                    Task { await model.act(.decline, id: friendship.id) }
                } onCancel: {
                    Task { await model.act(.cancel, id: friendship.id) }
                } onDelete: {
                    Task { await model.act(.delete, id: friendship.id) }
                } onBlock: {
                    Task { await model.act(.block, id: friendship.id) }
                }
            }
        }
    }
}

struct FriendCard: View {
    let friendship: FriendshipDto
    let meId: String?
    let variant: Variant
    var onAccept: (() -> Void)? = nil
    var onDecline: (() -> Void)? = nil
    var onCancel: (() -> Void)? = nil
    var onDelete: (() -> Void)? = nil
    var onBlock: (() -> Void)? = nil

    enum Variant { case received, sent, accepted, blocked }

    var body: some View {
        let user = FriendshipLogic.otherUser(friendship, meId: meId)
        VStack(alignment: .leading, spacing: Space.s3) {
            HStack(spacing: Space.s4) {
                Text(String((user.name ?? user.handle ?? "?").prefix(1)).uppercased())
                    .font(.atenderLg)
                    .fontWeight(.bold)
                    .foregroundStyle(Color.white)
                    .frame(width: 56, height: 56)
                    .background(LinearGradient(colors: FriendAvatar.gradient(id: user.id), startPoint: .topLeading, endPoint: .bottomTrailing))
                    .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
                VStack(alignment: .leading, spacing: Space.s1) {
                    Text(user.name ?? "名前未設定").font(.atenderLg).fontWeight(.bold).foregroundStyle(Color.textPrimary)
                    Text("@\(user.handle ?? String(user.id.prefix(8)))").font(.atenderSm).foregroundStyle(Color.textSecondary)
                }
                Spacer()
            }
            HStack {
                Spacer()
                switch variant {
                case .received:
                    AtenderButton(title: "承認", variant: .primary, size: .sm) { onAccept?() }.fixedSize()
                    AtenderButton(title: "拒否", variant: .ghost, size: .sm) { onDecline?() }.fixedSize()
                case .sent:
                    AtenderButton(title: "取消", variant: .ghost, size: .sm) { onCancel?() }.fixedSize()
                case .accepted:
                    AtenderButton(title: "ブロック", variant: .ghost, size: .sm) { onBlock?() }.fixedSize()
                    AtenderButton(title: "解除", variant: .ghost, size: .sm) { onDelete?() }.fixedSize()
                case .blocked:
                    AtenderButton(title: "解除", variant: .ghost, size: .sm) { onDelete?() }.fixedSize()
                }
            }
        }
        .padding(Space.s4)
        .background(Color.bgElevated)
        .clipShape(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
        .atenderShadow(.card)
        .accessibilityIdentifier("friend-card-\(friendship.id)")
    }
}

enum FriendAvatar {
    static func gradient(id: String) -> [Color] {
        let palettes: [[Color]] = [
            [Color(hexString: "#F97316"), Color(hexString: "#EC4899")],
            [Color(hexString: "#8B5CF6"), Color(hexString: "#06B6D4")],
            [Color(hexString: "#10B981"), Color(hexString: "#3B82F6")],
            [Color(hexString: "#F59E0B"), Color(hexString: "#EF4444")],
            [Color(hexString: "#6366F1"), Color(hexString: "#A855F7")],
        ]
        var hash = 0
        for scalar in id.unicodeScalars { hash = hash &* 31 &+ Int(scalar.value) }
        return palettes[abs(hash) % palettes.count]
    }
}

struct AddFriendSheet: View {
    @Binding var isPresented: Bool
    let onChanged: () async -> Void
    @Environment(AppEnvironment.self) private var environment
    @Environment(AppRouter.self) private var router
    @State private var rawHandle = ""
    @State private var searchResults: [UserSearchDto] = []
    @State private var invite = ""
    @State private var myInviteCode: String?
    @State private var copyMessage: String?
    @State private var isPending = false
    @State private var scannerPresented = false

    var body: some View {
        SheetScaffold(title: "友達を追加", isPresented: $isPresented) {
            VStack(alignment: .leading, spacing: Space.s5) {
                LabeledInput(label: "ハンドル検索", text: $rawHandle, placeholder: "@handle")
                ForEach(searchResults) { user in
                    searchResultRow(user)
                }
                inviteLinkSection
                AtenderButton(title: "QR コードで追加", systemImage: "qrcode.viewfinder", variant: .secondary) {
                    scannerPresented = true
                }
                LabeledInput(label: "招待リンクで追加", text: $invite)
            }
        } footer: {
            AtenderButton(title: "追加", variant: .primary, isLoading: isPending, isEnabled: !invite.isEmpty && !isPending) {
                Task { await request(inviteCode: RoomInviteCode.parse(invite)) }
            }
        }
        .accessibilityIdentifier("add-friend-sheet")
        .task {
            myInviteCode = try? await environment.meRepository.me().user.inviteCode
        }
        .task(id: rawHandle) {
            let handle = rawHandle.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "@", with: "")
            guard !handle.isEmpty else {
                searchResults = []
                return
            }
            try? await Task.sleep(nanoseconds: 300_000_000)
            searchResults = (try? await environment.friendshipRepository.searchUsers(handle: handle)) ?? []
        }
        .fullScreenCover(isPresented: $scannerPresented) {
            QRScannerScreen(
                onResult: { url in
                    scannerPresented = false
                    isPresented = false
                    router.handleDeepLink(url)
                },
                onCancel: { scannerPresented = false }
            )
        }
    }

    private var inviteLinkSection: some View {
        let inviteCode = myInviteCode
        let link = InviteURL.friend(inviteCode: inviteCode ?? "")
        return VStack(alignment: .leading, spacing: Space.s2) {
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
            }
        }
    }

    private func searchResultRow(_ user: UserSearchDto) -> some View {
        HStack {
            VStack(alignment: .leading) {
                Text(user.name ?? "名前未設定").font(.atenderSm).fontWeight(.bold)
                Text("@\(user.handle ?? String(user.id.prefix(8)))").font(.atenderXs).foregroundStyle(Color.textTertiary)
            }
            Spacer()
            friendshipSearchAction(for: user)
        }
        .foregroundStyle(Color.textPrimary)
        .padding(Space.s3)
        .background(Color.bgMuted)
        .clipShape(RoundedRectangle(cornerRadius: Radius.md))
    }

    @ViewBuilder
    private func friendshipSearchAction(for user: UserSearchDto) -> some View {
        switch user.friendshipStatus {
        case nil:
            Button {
                Task { await request(userId: user.id) }
            } label: {
                Text("申請")
                    .font(.atenderSm)
                    .fontWeight(.bold)
                    .foregroundStyle(Color.accent500)
            }
            .buttonStyle(.plain)
            .disabled(isPending)
        case .some(.pending):
            friendshipStatusBadge("申請済")
        case .some(.accepted):
            friendshipStatusBadge("友達")
        case .some(.declined), .some(.blocked), .some(.unknown):
            AtenderButton(title: "申請", variant: .ghost, size: .sm, isEnabled: false) {}
                .fixedSize()
        }
    }

    private func friendshipStatusBadge(_ title: String) -> some View {
        Text(title)
            .font(.atenderSm)
            .fontWeight(.bold)
            .foregroundStyle(Color.textSecondary)
            .padding(.horizontal, Space.s3)
            .padding(.vertical, Space.s2)
            .background(Color.bgElevated)
            .clipShape(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
    }

    private func request(userId: String? = nil, inviteCode: String? = nil) async {
        isPending = true
        defer { isPending = false }
        do {
            _ = try await environment.friendshipRepository.createFriendship(CreateFriendshipInput(receiverHandle: nil, receiverInviteCode: inviteCode, receiverId: userId))
            await onChanged()
            isPresented = false
        } catch {
            environment.toastCenter.show("保存できませんでした、もう一度試してください")
        }
    }
}

struct AddFriendByInviteCodeView: View {
    let inviteCode: String
    @Environment(AppEnvironment.self) private var environment
    @Environment(AppRouter.self) private var router
    @State private var errorText: String?

    var body: some View {
        VStack {
            Panel {
                VStack(spacing: Space.s4) {
                    Text(errorText ?? "友達申請を送信しています...")
                        .font(.atenderLg)
                        .fontWeight(.bold)
                        .foregroundStyle(errorText == nil ? Color.textPrimary : Color.statusAbsent)
                    if errorText != nil {
                        AtenderButton(title: "友達へ戻る") { router.friendsPath = NavigationPath() }
                    } else {
                        ProgressView().tint(.accent500)
                    }
                }
            }
        }
        .padding(Space.pagePxMobile)
        .task {
            do {
                _ = try await environment.friendshipRepository.createFriendship(CreateFriendshipInput(receiverHandle: nil, receiverInviteCode: inviteCode, receiverId: nil))
                router.friendsPath = NavigationPath()
            } catch {
                errorText = error.userFacingMessage
            }
        }
    }
}
