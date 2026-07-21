import SwiftUI
import Observation
import UniformTypeIdentifiers

@MainActor
@Observable
final class RoomsViewModel {
    @ObservationIgnored private let env: AppEnvironment
    private(set) var rooms: [RoomSummaryDto] = []
    private(set) var isLoading = false
    var errorMessage: String?

    init(env: AppEnvironment) {
        self.env = env
    }

    func load(force: Bool = false) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            rooms = try await env.roomRepository.rooms(force: force)
        } catch {
            errorMessage = error.userFacingMessage
        }
    }
}

struct RoomsView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(AppRouter.self) private var router
    @State private var model: RoomsViewModel?
    @State private var activeSheet: RoomsSheet?

    private enum RoomsSheet: Identifiable {
        case create, join
        var id: Int { self == .create ? 0 : 1 }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Space.s6) {
                header
                if let model {
                    content(model)
                }
            }
            .padding(Space.pagePxMobile)
        }
        .background(Color.bgBase)
        .navigationTitle("ルーム")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            if model == nil { model = RoomsViewModel(env: environment) }
            await model?.load()
        }
        .sheet(item: $activeSheet) { sheet in
            switch sheet {
            case .create:
                RoomCreateSheet(isPresented: activeSheetBinding, onCreated: {
                    await model?.load(force: true)
                })
            case .join:
                JoinByCodeSheet(isPresented: activeSheetBinding, onJoined: { id in
                    router.roomsPath.append(RoomsRoute.detail(id))
                })
            }
        }
    }

    private var activeSheetBinding: Binding<Bool> {
        Binding(get: { activeSheet != nil }, set: { if !$0 { activeSheet = nil } })
    }

    private var header: some View {
        VStack(alignment: .trailing, spacing: Space.s2) {
            HStack(spacing: Space.s3) {
                Text("ルーム")
                    .font(.atender2xl)
                    .fontWeight(.bold)
                    .foregroundStyle(Color.textPrimary)
                Spacer()
                AtenderButton(title: "リンクで参加", variant: .secondary, size: .sm) { activeSheet = .join }
                AtenderButton(title: "作成", variant: .primary, size: .sm) { activeSheet = .create }
            }
            Button("みんなの時間割") {
                router.roomsPath.append(RoomsRoute.templates)
            }
            .font(.atenderXs)
            .foregroundStyle(Color.textTertiary)
        }
    }

    @ViewBuilder
    private func content(_ model: RoomsViewModel) -> some View {
        if model.isLoading {
            VStack(spacing: Space.s3) {
                ForEach(0..<3, id: \.self) { _ in Skeleton(width: nil, height: 116, radius: Radius.lg) }
            }
        } else if model.rooms.isEmpty {
            EmptyState(
                title: "まだルームに参加していません",
                message: "友達の時間割と予定をまとめて見られます。",
                actionTitle: "ルームを作成"
            ) { activeSheet = .create }
        } else {
            LazyVGrid(columns: [GridItem(.flexible())], spacing: Space.s3) {
                ForEach(model.rooms) { room in
                    RoomCard(room: room) {
                        router.roomsPath.append(RoomsRoute.detail(room.id))
                    }
                    .accessibilityIdentifier("room-card-\(room.id)")
                }
            }
            .accessibilityIdentifier("rooms-list")
        }
    }
}

struct RoomCard: View {
    let room: RoomSummaryDto
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            ZStack(alignment: .leading) {
                LinearGradient(colors: RoomTint.gradient(id: room.id), startPoint: .topLeading, endPoint: .bottomTrailing)
                    .opacity(0.30)
                VStack(alignment: .leading, spacing: Space.s5) {
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: Space.s1) {
                            Text(room.name)
                                .font(.atenderXl)
                                .fontWeight(.bold)
                                .foregroundStyle(Color.textPrimary)
                                .lineLimit(1)
                            Text("\(room.memberCount) メンバー")
                                .font(.atenderSm)
                                .fontWeight(.medium)
                                .foregroundStyle(Color.textSecondary)
                        }
                        Spacer()
                        Text(room.myRole.rawValue)
                            .font(.caption2)
                            .fontWeight(.bold)
                            .foregroundStyle(Color.textPrimary)
                            .padding(.horizontal, Space.s3)
                            .padding(.vertical, Space.s1)
                            .background(Color.bgBase.opacity(0.7))
                            .clipShape(Capsule())
                    }
                    if let upcoming = room.upcomingEvent {
                        HStack(spacing: Space.s2) {
                            Circle().fill(Color.accent500).frame(width: 8, height: 8)
                            Text(RoomCardLogic.upcomingLabel(start: upcoming.start, title: upcoming.title))
                                .font(.atenderXs)
                                .fontWeight(.bold)
                                .foregroundStyle(Color.textPrimary)
                                .lineLimit(1)
                        }
                        .padding(.horizontal, Space.s3)
                        .padding(.vertical, Space.s2)
                        .background(Color.bgElevated.opacity(0.72))
                        .clipShape(Capsule())
                    }
                }
                .padding(Space.s5)
            }
            .frame(maxWidth: .infinity, minHeight: 116, alignment: .leading)
            .background(Color.bgElevated)
            .clipShape(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
            .atenderShadow(.card)
        }
        .buttonStyle(.plain)
    }
}

enum RoomTint {
    static func gradient(id: String) -> [Color] {
        let palettes: [[Color]] = [
            [Color.statusPresent.opacity(0.8), Color(hexString: "#06B6D4").opacity(0.4)],
            [Color(hexString: "#8B5CF6").opacity(0.8), Color(hexString: "#D946EF").opacity(0.4)],
            [Color(hexString: "#FBBF24").opacity(0.8), Color(hexString: "#F43F5E").opacity(0.4)],
            [Color(hexString: "#0EA5E9").opacity(0.8), Color(hexString: "#6366F1").opacity(0.4)],
        ]
        var hash: UInt32 = 0
        for scalar in id.unicodeScalars {
            hash = hash &* 31 &+ scalar.value
        }
        return palettes[Int(hash) % palettes.count]
    }
}

struct RoomCreateSheet: View {
    @Binding var isPresented: Bool
    let onCreated: () async -> Void
    @Environment(AppEnvironment.self) private var environment
    @State private var name = ""
    @State private var description = ""
    @State private var isPending = false

    var body: some View {
        SheetScaffold(title: "ルームを作成", isPresented: $isPresented) {
            VStack(alignment: .leading, spacing: Space.s4) {
                LabeledInput(label: "ルーム名", text: $name)
                LabeledInput(label: "説明", text: $description, axis: .vertical)
            }
        } footer: {
            HStack(spacing: Space.s3) {
                AtenderButton(title: "キャンセル", variant: .ghost) { isPresented = false }
                AtenderButton(title: "作成", variant: .primary, isLoading: isPending, isEnabled: !name.isEmpty && !isPending) {
                    Task {
                        isPending = true
                        defer { isPending = false }
                        do {
                            _ = try await environment.roomRepository.createRoom(CreateRoomInput(name: name, description: description.isEmpty ? nil : description, showMemberTimetables: nil))
                            await onCreated()
                            isPresented = false
                        } catch {
                            environment.toastCenter.show("保存できませんでした、もう一度試してください")
                        }
                    }
                }
            }
        }
        .accessibilityIdentifier("room-create-sheet")
    }
}

struct JoinByCodeSheet: View {
    @Binding var isPresented: Bool
    let onJoined: (String) -> Void
    @Environment(AppEnvironment.self) private var environment
    @Environment(AppRouter.self) private var router
    @State private var code = ""
    @State private var isPending = false
    @State private var errorMessage: String?
    @State private var scannerPresented = false

    var body: some View {
        SheetScaffold(title: "リンクで参加", isPresented: $isPresented) {
            VStack(alignment: .leading, spacing: Space.s4) {
                AtenderButton(title: "QR コードで参加", systemImage: "qrcode.viewfinder", variant: .secondary) {
                    scannerPresented = true
                }
                LabeledInput(label: "招待リンクまたはコード", text: $code)
                if let errorMessage {
                    Text(errorMessage).font(.atenderSm).foregroundStyle(Color.statusAbsent)
                }
            }
        } footer: {
            AtenderButton(title: "参加", variant: .primary, isLoading: isPending, isEnabled: !code.isEmpty && !isPending) {
                Task {
                    isPending = true
                    errorMessage = nil
                    defer { isPending = false }
                    do {
                        let room = try await environment.roomRepository.joinRoom(inviteCode: RoomInviteCode.parse(code))
                        isPresented = false
                        onJoined(room.id)
                    } catch {
                        errorMessage = error.userFacingMessage
                    }
                }
            }
        }
        .accessibilityIdentifier("join-by-code-sheet")
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
}

struct JoinRoomView: View {
    let inviteCode: String
    @Environment(AppEnvironment.self) private var environment
    @Environment(AppRouter.self) private var router
    @State private var phase: Phase = .joining

    enum Phase {
        case joining, failed
    }

    var body: some View {
        VStack {
            Panel {
                VStack(spacing: Space.s4) {
                    Text(phase == .failed ? "招待リンクが無効です" : "ルームに参加しています")
                        .font(.atenderLg)
                        .fontWeight(.bold)
                        .foregroundStyle(Color.textPrimary)
                    if phase == .failed {
                        AtenderButton(title: "ルームへ戻る") {
                            router.roomsPath = NavigationPath()
                        }
                    } else {
                        ProgressView().tint(.accent500)
                    }
                }
            }
        }
        .padding(Space.pagePxMobile)
        .task {
            do {
                let room = try await environment.roomRepository.joinRoom(inviteCode: inviteCode)
                if !router.roomsPath.isEmpty { router.roomsPath.removeLast() }
                router.roomsPath.append(RoomsRoute.detail(room.id))
            } catch {
                phase = .failed
            }
        }
    }
}
