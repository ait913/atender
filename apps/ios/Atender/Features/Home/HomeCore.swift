import SwiftUI

enum HomeContext: Equatable {
    case `self`
    case room(roomId: String)
}

enum HomeViewMode: String, CaseIterable {
    case timetable
    case calendar
}

enum ContextChipItem: Equatable, Identifiable {
    case selfChip(label: String)
    case room(roomId: String, roomName: String)

    var id: String {
        switch self {
        case .selfChip: return "self"
        case .room(let roomId, _): return roomId
        }
    }
}

enum HomeChips {
    static func items(rooms: [RoomSummaryDto]) -> [ContextChipItem] {
        [.selfChip(label: "自分")] + rooms.map { .room(roomId: $0.id, roomName: $0.name) }
    }
}

enum HomeSheet: Identifiable, Equatable {
    case roomCreate
    case roomJoin(initialCode: String?)
    case roomSettings(roomId: String)

    var id: String {
        switch self {
        case .roomCreate: return "create"
        case .roomJoin: return "join"
        case .roomSettings(let roomId): return "settings:\(roomId)"
        }
    }
}

enum RoomAddAction: Equatable { case create, join, scanQR }

struct HomeView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var context: HomeContext = .self
    @State private var mode: HomeViewMode = .timetable
    @State private var semesterId: String?
    @State private var didApplyDefaultSemester = false
    @State private var rooms: [RoomSummaryDto] = []
    @State private var semesters: [SemesterDto] = []
    @State private var showTimetableSettings = false
    @State private var sheet: HomeSheet?
    @State private var scannerPresented = false

    var body: some View {
        VStack(spacing: Space.s3) {
            ContextChips(
                items: HomeChips.items(rooms: rooms),
                selected: context,
                onChange: { context = $0 },
                onAddRoom: handleAddRoom
            )
            .padding(.horizontal, -Space.pagePxMobile)
            CalendarModePicker(selection: $mode)
            GeometryReader { proxy in
                HomeBody(
                    context: context,
                    mode: mode,
                    semesterId: $semesterId,
                    showTimetableSettings: $showTimetableSettings,
                    available: proxy.size.height
                )
            }
            .frame(maxHeight: .infinity)
        }
        .padding(.horizontal, Space.pagePxMobile)
        .padding(.top, Space.s3)
        .background(Color.clear)
        .navigationTitle("ホーム")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                SemesterMenu(semesters: semesters, semesterId: $semesterId)
            }
            .atenderPlainToolbarBackground()
            if context == .self && mode == .timetable {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showTimetableSettings = true
                    } label: {
                        Image(systemName: "gearshape")
                    }
                    .accessibilityLabel("時間割の設定")
                }
            }
            if case .room(let roomId) = context {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        sheet = .roomSettings(roomId: roomId)
                    } label: {
                        Image(systemName: "gearshape")
                    }
                    .accessibilityLabel("ルームの設定")
                    .accessibilityIdentifier("home-room-settings")
                }
            }
        }
        .safeAreaInset(edge: .bottom) {
            if context == .self { Color.clear.frame(height: 64) }
        }
        .overlay(alignment: .bottom) {
            if context == .self { HomeAttendanceOverlay() }
        }
        .sheet(item: $sheet) { activeSheet in
            homeSheetContent(activeSheet)
        }
        .fullScreenCover(isPresented: $scannerPresented) {
            QRScannerScreen(
                onResult: { url in
                    scannerPresented = false
                    environment.appRouter.handleDeepLink(url)
                },
                onCancel: { scannerPresented = false }
            )
        }
        .task { consumePendingRoomJoin() }
        .onChange(of: environment.appRouter.pendingRoomJoinCode) { _, _ in consumePendingRoomJoin() }
        .task {
            rooms = (try? await environment.roomRepository.rooms()) ?? []
            await loadSemesters()
            if let cached: MeResponse = environment.queryClient.data(for: .me(), as: MeResponse.self) {
                applyDefaultSemester(cached)
                applyFallbackSemester()
                return
            }
            if let me = try? await environment.meRepository.me() {
                applyDefaultSemester(me)
            }
            applyFallbackSemester()
        }
    }

    private func handleAddRoom(_ action: RoomAddAction) {
        switch action {
        case .create: sheet = .roomCreate
        case .join: sheet = .roomJoin(initialCode: nil)
        case .scanQR: scannerPresented = true
        }
    }

    @ViewBuilder
    private func homeSheetContent(_ activeSheet: HomeSheet) -> some View {
        switch activeSheet {
        case .roomCreate:
            RoomCreateSheet(isPresented: sheetPresentedBinding, onCreated: { created in
                rooms = (try? await environment.roomRepository.rooms(force: true)) ?? rooms
                context = .room(roomId: created.id)
            })
        case .roomJoin(let initialCode):
            JoinByCodeSheet(isPresented: sheetPresentedBinding, initialCode: initialCode, onJoined: { id in
                Task {
                    rooms = (try? await environment.roomRepository.rooms(force: true)) ?? rooms
                    context = .room(roomId: id)
                }
            })
        case .roomSettings(let roomId):
            RoomSettingsSheet(roomId: roomId, isPresented: sheetPresentedBinding, onChanged: {
                rooms = (try? await environment.roomRepository.rooms(force: true)) ?? rooms
            }, onRemoved: {
                context = .self
                Task { rooms = (try? await environment.roomRepository.rooms(force: true)) ?? rooms }
            })
        }
    }

    private var sheetPresentedBinding: Binding<Bool> {
        Binding(get: { sheet != nil }, set: { if !$0 { sheet = nil } })
    }

    private func consumePendingRoomJoin() {
        guard let code = environment.appRouter.pendingRoomJoinCode else { return }
        environment.appRouter.pendingRoomJoinCode = nil
        sheet = .roomJoin(initialCode: code)
    }

    private func applyDefaultSemester(_ me: MeResponse) {
        guard !didApplyDefaultSemester, semesterId == nil, let defaultId = me.user.defaultSemesterId else { return }
        semesterId = defaultId
        didApplyDefaultSemester = true
    }

    private func applyFallbackSemester() {
        if semesterId == nil {
            semesterId = semesters.first?.id
        }
    }

    private func loadSemesters() async {
        if let cached: [SemesterDto] = environment.queryClient.data(for: .semesters(), as: [SemesterDto].self) {
            semesters = cached
        }
        if let loaded = try? await environment.semesterRepository.semesters() {
            semesters = loaded
        }
    }
}

struct SemesterMenu: View {
    let semesters: [SemesterDto]
    @Binding var semesterId: String?

    var body: some View {
        Menu {
            ForEach(semesters) { semester in
                Button {
                    semesterId = semester.id
                } label: {
                    HStack {
                        Text(semester.name)
                        if semester.id == semesterId {
                            Image(systemName: "checkmark")
                        }
                    }
                }
            }
        } label: {
            HStack(spacing: Space.s2) {
                Text(current?.name ?? "学期を選択")
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .foregroundStyle(Color.textSecondary)
                Image(systemName: "chevron.down")
                    .font(.caption2)
                    .foregroundStyle(Color.textTertiary)
            }
        }
        .tint(Color.textSecondary)
        .accessibilityIdentifier("home-semester-menu")
    }

    private var current: SemesterDto? {
        semesters.first { $0.id == semesterId } ?? semesters.first
    }
}

struct ContextChips: View {
    let items: [ContextChipItem]
    let selected: HomeContext
    let onChange: (HomeContext) -> Void
    let onAddRoom: (RoomAddAction) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Space.s2) {
                ForEach(items) { item in
                    Button {
                        onChange(context(for: item))
                    } label: {
                        HStack(spacing: Space.s2) {
                            Image(systemName: icon(for: item))
                                .font(.atenderSm)
                            Text(label(for: item))
                                .font(.atenderSm)
                                .fontWeight(.bold)
                                .lineLimit(1)
                                .truncationMode(.tail)
                        }
                        .foregroundStyle(isActive(item) ? Color.accent500 : Color.textSecondary)
                        .padding(.horizontal, Space.s4)
                        .frame(height: 44)
                        .background(isActive(item) ? Color.accent500.opacity(0.15) : Color.bgElevated)
                        .clipShape(Capsule())
                        .overlay(Capsule().stroke(isActive(item) ? Color.accent500 : Color.borderSubtle, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    .conditional(isActive(item)) { $0.atenderShadow(.glowSoft) }
                }
                Menu {
                    Button { onAddRoom(.create) } label: { Label("ルームを作成", systemImage: "plus.circle") }
                    Button { onAddRoom(.join) } label: { Label("リンクで参加", systemImage: "link") }
                    Button { onAddRoom(.scanQR) } label: { Label("QR で参加", systemImage: "qrcode.viewfinder") }
                } label: {
                    Image(systemName: "plus")
                        .font(.atenderSm)
                        .fontWeight(.bold)
                        .foregroundStyle(Color.textTertiary)
                        .frame(width: 44, height: 44)
                        .background(Color.bgElevated)
                        .clipShape(Circle())
                        .overlay(Circle().stroke(Color.borderSubtle, lineWidth: 1))
                }
                .accessibilityLabel("ルームを追加")
                .accessibilityIdentifier("rooms-add")
            }
        }
        .scrollClipDisabled()
        .contentMargins(.horizontal, Space.pagePxMobile, for: .scrollContent)
        .accessibilityIdentifier("context-chips")
    }

    private func context(for item: ContextChipItem) -> HomeContext {
        switch item {
        case .selfChip: return .self
        case .room(let roomId, _): return .room(roomId: roomId)
        }
    }

    private func label(for item: ContextChipItem) -> String {
        switch item {
        case .selfChip(let label): return label
        case .room(_, let name): return name
        }
    }

    private func icon(for item: ContextChipItem) -> String {
        switch item {
        case .selfChip: return "person"
        case .room: return "person.2"
        }
    }

    private func isActive(_ item: ContextChipItem) -> Bool { selected == context(for: item) }
}

struct HomeBody: View {
    let context: HomeContext
    let mode: HomeViewMode
    @Binding var semesterId: String?
    @Binding var showTimetableSettings: Bool
    let available: CGFloat

    var body: some View {
        switch (context, mode) {
        case (.self, .timetable):
            SelfTimetableView(semesterId: $semesterId, showSettings: $showTimetableSettings, available: available)
        case (.self, .calendar):
            PersonalCalendar(semesterId: semesterId, available: available)
        case (.room(let roomId), .timetable):
            // ★ .id が無いと roomId が変わっても structural identity が同じままで
            //   @State (week / viewModel) が持ち越され、別ルームの画面に前ルームのデータが残る。
            RoomTimetable(roomId: roomId, semesterId: semesterId, available: available)
                .id(roomId)
        case (.room(let roomId), .calendar):
            RoomCalendar(roomId: roomId, semesterId: semesterId, available: available)
                .id(roomId)
        }
    }
}
