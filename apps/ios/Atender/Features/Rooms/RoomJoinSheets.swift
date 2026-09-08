import SwiftUI

struct RoomCreateSheet: View {
    @Binding var isPresented: Bool
    let onCreated: (RoomDto) async -> Void
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
                            let created = try await environment.roomRepository.createRoom(CreateRoomInput(name: name, description: description.isEmpty ? nil : description, showMemberTimetables: nil))
                            await onCreated(created)
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
    var initialCode: String? = nil
    let onJoined: (String) -> Void
    @Environment(AppEnvironment.self) private var environment
    @Environment(AppRouter.self) private var router
    @State private var code = ""
    @State private var isPending = false
    @State private var errorMessage: String?
    @State private var scannerPresented = false
    @State private var didAttemptInitialJoin = false

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
                Task { await attemptJoin() }
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
        .task {
            guard !didAttemptInitialJoin, let initialCode else { return }
            didAttemptInitialJoin = true
            code = initialCode
            await attemptJoin()
        }
    }

    private func attemptJoin() async {
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
