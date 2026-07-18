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

    static func isVisible(rooms: [RoomSummaryDto]) -> Bool {
        !rooms.isEmpty
    }
}

struct HomeView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var context: HomeContext = .self
    @State private var mode: HomeViewMode = .timetable
    @State private var semesterId: String?
    @State private var didApplyDefaultSemester = false
    @State private var rooms: [RoomSummaryDto] = []
    @State private var semesters: [SemesterDto] = []
    @State private var showTimetableSettings = false

    var body: some View {
        VStack(spacing: Space.s3) {
            if context == .self {
                SemesterMenu(semesters: semesters, semesterId: $semesterId)
            }
            if HomeChips.isVisible(rooms: rooms) {
                ContextChips(
                    items: HomeChips.items(rooms: rooms),
                    selected: context,
                    onChange: { context = $0 },
                    onAddRoom: { environment.appRouter.selectedTab = .rooms }
                )
            }
            Picker("表示", selection: $mode) {
                Text("時間割").tag(HomeViewMode.timetable)
                Text("カレンダー").tag(HomeViewMode.calendar)
            }
            .pickerStyle(.segmented)
            .frame(maxWidth: 240)
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
        .navigationBarTitleDisplayMode(.large)
        .safeAreaInset(edge: .bottom) {
            if context == .self { NowNextBarHost() }
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                if context == .self && mode == .timetable {
                    Button {
                        showTimetableSettings = true
                    } label: {
                        Image(systemName: "gearshape")
                    }
                    .frame(width: 44, height: 44)
                    .accessibilityLabel("時間割の設定")
                }
            }
        }
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
        HStack {
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
            Spacer()
        }
    }

    private var current: SemesterDto? {
        semesters.first { $0.id == semesterId } ?? semesters.first
    }
}

struct ContextChips: View {
    let items: [ContextChipItem]
    let selected: HomeContext
    let onChange: (HomeContext) -> Void
    let onAddRoom: () -> Void

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
                Button(action: onAddRoom) {
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
            }
        }
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
            RoomTimetable(roomId: roomId, available: available)
        case (.room(let roomId), .calendar):
            RoomCalendar(roomId: roomId)
        }
    }
}
