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

struct HomeView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var context: HomeContext = .self
    @State private var mode: HomeViewMode = .timetable
    @State private var semesterId: String?
    @State private var didApplyDefaultSemester = false
    @State private var rooms: [RoomSummaryDto] = []

    var body: some View {
        ZStack(alignment: .bottom) {
            ScrollView {
                VStack(spacing: Space.s3) {
                    ContextChips(
                        items: HomeChips.items(rooms: rooms),
                        selected: context,
                        onChange: { context = $0 },
                        onAddRoom: { environment.appRouter.selectedTab = .rooms }
                    )
                    HomeViewModeTabs(mode: mode) { mode = $0 }
                    if context == .self && mode == .calendar {
                        HomeSemesterPicker(semesterId: $semesterId)
                    }
                    HomeBody(context: context, mode: mode, semesterId: $semesterId)
                }
                .padding(.horizontal, Space.pagePxMobile)
                .padding(.top, Space.s3)
                .padding(.bottom, 128)
            }

            if context == .self && mode == .timetable {
                SelfTodayCTA()
            }
        }
        .background(Color.clear)
        .task {
            rooms = (try? await environment.roomRepository.rooms()) ?? []
            if let cached: MeResponse = environment.queryClient.data(for: .me(), as: MeResponse.self) {
                applyDefaultSemester(cached)
                return
            }
            if let me = try? await environment.meRepository.me() {
                applyDefaultSemester(me)
            }
        }
    }

    private func applyDefaultSemester(_ me: MeResponse) {
        guard !didApplyDefaultSemester, semesterId == nil, let defaultId = me.user.defaultSemesterId else { return }
        semesterId = defaultId
        didApplyDefaultSemester = true
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
                        .frame(height: 40)
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
                        .frame(width: 40, height: 40)
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

struct HomeViewModeTabs: View {
    let mode: HomeViewMode
    let onChange: (HomeViewMode) -> Void

    var body: some View {
        HStack(spacing: 0) {
            tab("時間割", .timetable)
            tab("カレンダー", .calendar)
        }
        .padding(4)
        .background(Color.bgMuted)
        .clipShape(Capsule())
    }

    private func tab(_ title: String, _ value: HomeViewMode) -> some View {
        Button {
            onChange(value)
        } label: {
            Text(title)
                .font(.atenderSm)
                .fontWeight(.bold)
                .foregroundStyle(mode == value ? Color.textOnAccent : Color.textSecondary)
                .frame(maxWidth: .infinity)
                .frame(height: 34)
                .background(mode == value ? Color.accent500 : Color.clear)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .conditional(mode == value) { $0.atenderShadow(.glowSoft) }
    }
}

struct HomeSemesterPicker: View {
    @Environment(AppEnvironment.self) private var environment
    @Binding var semesterId: String?
    var trailing: AnyView?
    @State private var semesters: [SemesterDto] = []
    @State private var open = false

    var body: some View {
        HStack(spacing: Space.s2) {
            Button { open = true } label: {
                HStack(spacing: Space.s2) {
                    Text(current?.name ?? "学期を選択")
                        .font(.atenderBase)
                        .fontWeight(.bold)
                        .foregroundStyle(Color.textPrimary)
                    Image(systemName: "chevron.down")
                        .font(.atenderXs)
                        .foregroundStyle(Color.textTertiary)
                }
            }
            .buttonStyle(.plain)
            Spacer()
            trailing
        }
        .frame(minHeight: 36)
        .task { await load() }
        .background {
            BottomSheet(title: "学期を選択", isPresented: $open) {
                VStack(spacing: Space.s2) {
                    ForEach(semesters) { semester in
                        Button {
                            semesterId = semester.id
                            open = false
                        } label: {
                            HStack {
                                Text(semester.name)
                                    .font(.atenderBase)
                                    .fontWeight(.bold)
                                Spacer()
                                if semester.id == semesterId {
                                    Image(systemName: "checkmark")
                                }
                            }
                            .foregroundStyle(semester.id == semesterId ? Color.accent500 : Color.textPrimary)
                            .padding(Space.s3)
                            .background(semester.id == semesterId ? Color.accent500.opacity(0.15) : Color.bgMuted)
                            .clipShape(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private var current: SemesterDto? {
        semesters.first { $0.id == semesterId } ?? semesters.first
    }

    private func load() async {
        if let cached: [SemesterDto] = environment.queryClient.data(for: .semesters(), as: [SemesterDto].self) {
            semesters = cached
        }
        if let loaded = try? await environment.semesterRepository.semesters() {
            semesters = loaded
            if semesterId == nil { semesterId = loaded.first?.id }
        }
    }
}

struct HomeBody: View {
    let context: HomeContext
    let mode: HomeViewMode
    @Binding var semesterId: String?

    var body: some View {
        switch (context, mode) {
        case (.self, .timetable):
            SelfTimetableView(semesterId: $semesterId)
        case (.self, .calendar):
            PersonalCalendar(semesterId: semesterId)
        case (.room(let roomId), .timetable):
            RoomTimetable(roomId: roomId)
        case (.room(let roomId), .calendar):
            RoomCalendar(roomId: roomId)
        }
    }
}
