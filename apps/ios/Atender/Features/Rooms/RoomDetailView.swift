import SwiftUI
import Observation

@MainActor
@Observable
final class RoomDetailViewModel {
    @ObservationIgnored private let env: AppEnvironment
    let roomId: String
    private(set) var room: RoomDto?
    private(set) var isLoading = false

    init(env: AppEnvironment, roomId: String) {
        self.env = env
        self.roomId = roomId
    }

    func load(force: Bool = false) async {
        isLoading = true
        defer { isLoading = false }
        room = try? await env.roomRepository.room(id: roomId, force: force)
    }
}

struct RoomDetailView: View {
    let roomId: String
    @Environment(AppEnvironment.self) private var environment
    @State private var model: RoomDetailViewModel?
    @State private var tab: HomeViewMode = .timetable
    @State private var settingsOpen = false

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            header
            CalendarModePicker(selection: $tab, identifier: "room-detail-tabs")
            Group {
                if tab == .calendar {
                    GeometryReader { proxy in
                        RoomCalendar(roomId: roomId, available: proxy.size.height)
                    }
                } else {
                    GeometryReader { proxy in
                        RoomTimetable(roomId: roomId, available: proxy.size.height)
                    }
                }
            }
        }
        .padding(Space.pagePxMobile)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Color.bgBase)
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            if model == nil { model = RoomDetailViewModel(env: environment, roomId: roomId) }
            await model?.load()
        }
        .sheet(isPresented: $settingsOpen) {
            RoomSettingsSheet(roomId: roomId, isPresented: $settingsOpen) {
                await model?.load(force: true)
            }
        }
    }

    private var header: some View {
        HStack(alignment: .top, spacing: Space.s3) {
            VStack(alignment: .leading, spacing: Space.s1) {
                Text(model?.room?.name ?? "ルーム")
                    .font(.atender2xl)
                    .fontWeight(.bold)
                    .foregroundStyle(Color.textPrimary)
                    .lineLimit(1)
                if let description = model?.room?.description, !description.isEmpty {
                    Text(description)
                        .font(.atenderSm)
                        .foregroundStyle(Color.textSecondary)
                        .lineLimit(2)
                }
            }
            Spacer()
            Button {
                settingsOpen = true
            } label: {
                Image(systemName: "gearshape.fill")
                    .foregroundStyle(Color.textPrimary)
                    .frame(width: 44, height: 44)
                    .background(Color.textPrimary.opacity(0.08))
                    .clipShape(Circle())
            }
        }
    }
}
