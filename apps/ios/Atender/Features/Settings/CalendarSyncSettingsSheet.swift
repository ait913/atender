import SwiftUI

struct CalendarSyncSettingsSheet: View {
    @Environment(AppEnvironment.self) private var environment
    @Binding var isPresented: Bool
    @State private var calendars: [EKCalendarInfo] = []

    var body: some View {
        SheetScaffold(title: "カレンダー同期", isPresented: $isPresented) {
            VStack(alignment: .leading, spacing: Space.s5) {
                accessSection
                if environment.calendarSyncCoordinator.access == .fullAccess {
                    linkedCalendarsSection
                    writeTargetSection
                }
            }
        } footer: {
            AtenderButton(title: "閉じる", variant: .secondary) { isPresented = false }
        }
        .task { reloadCalendars() }
    }

    private var accessSection: some View {
        VStack(alignment: .leading, spacing: Space.s2) {
            Text("権限").font(.atenderSm).fontWeight(.semibold).foregroundStyle(Color.textSecondary)
            switch environment.calendarSyncCoordinator.access {
            case .notDetermined:
                AtenderButton(title: "iPhone のカレンダーと同期する", variant: .primary) {
                    Task {
                        _ = await environment.calendarSyncCoordinator.requestFullAccess()
                        reloadCalendars()
                        await environment.calendarSyncCoordinator.syncCurrentMonth()
                    }
                }
            case .fullAccess:
                Label("同期できます", systemImage: "checkmark.circle.fill")
                    .font(.atenderSm)
                    .foregroundStyle(Color.accent500)
            case .writeOnly:
                VStack(alignment: .leading, spacing: Space.s2) {
                    Text("双方向同期にはフルアクセスが必要です。")
                        .font(.atenderXs)
                        .foregroundStyle(Color.textSecondary)
                    AtenderButton(title: "フルアクセスを要求", variant: .secondary) {
                        Task {
                            _ = await environment.calendarSyncCoordinator.requestFullAccess()
                            reloadCalendars()
                        }
                    }
                }
            case .denied, .restricted:
                Text("設定 > Atender でカレンダーへのアクセスを許可してください。")
                    .font(.atenderXs)
                    .foregroundStyle(Color.textSecondary)
            }
        }
    }

    private var linkedCalendarsSection: some View {
        VStack(alignment: .leading, spacing: Space.s2) {
            Text("表示するカレンダー").font(.atenderSm).fontWeight(.semibold).foregroundStyle(Color.textSecondary)
            ForEach(calendars) { calendar in
                Toggle(isOn: linkedBinding(calendar.id)) {
                    calendarLabel(calendar)
                }
            }
        }
    }

    private var writeTargetSection: some View {
        VStack(alignment: .leading, spacing: Space.s2) {
            Text("書き込み先").font(.atenderSm).fontWeight(.semibold).foregroundStyle(Color.textSecondary)
            Picker("書き込み先", selection: writeTargetBinding) {
                ForEach(calendars.filter(\.allowsModify)) { calendar in
                    Text("\(calendar.title)（\(calendar.sourceTitle)）").tag(Optional(calendar.id))
                }
            }
            .pickerStyle(.menu)
        }
    }

    private func calendarLabel(_ calendar: EKCalendarInfo) -> some View {
        HStack(spacing: Space.s2) {
            Circle()
                .fill(Color(hexString: calendar.colorHex ?? "#8b5cf6"))
                .frame(width: 10, height: 10)
            VStack(alignment: .leading, spacing: 2) {
                Text(calendar.title).font(.atenderSm).foregroundStyle(Color.textPrimary)
                Text(calendar.sourceTitle).font(.atenderXs).foregroundStyle(Color.textTertiary)
            }
        }
    }

    private func linkedBinding(_ id: String) -> Binding<Bool> {
        Binding(
            get: { environment.calendarSyncCoordinator.linkedCalendarIds.contains(id) },
            set: { value in
                var ids = environment.calendarSyncCoordinator.linkedCalendarIds
                if value {
                    ids.insert(id)
                } else {
                    ids.remove(id)
                }
                environment.calendarSyncCoordinator.linkedCalendarIds = ids
                Task { await environment.calendarSyncCoordinator.syncCurrentMonth() }
            }
        )
    }

    private var writeTargetBinding: Binding<String?> {
        Binding(
            get: { environment.calendarSyncCoordinator.writeTargetCalendarId },
            set: { environment.calendarSyncCoordinator.writeTargetCalendarId = $0 }
        )
    }

    private func reloadCalendars() {
        calendars = environment.calendarSyncCoordinator.availableCalendars()
        if environment.calendarSyncCoordinator.writeTargetCalendarId == nil {
            environment.calendarSyncCoordinator.writeTargetCalendarId = calendars.first(where: \.allowsModify)?.id
        }
    }
}
