import SwiftUI

struct RoomDaySheet: View {
    let roomId: String
    let date: String
    let events: [CalendarEvent]
    let resolveRoomEvent: (String) -> RoomEventDto?
    @Binding var path: NavigationPath
    let onChanged: () async -> Void
    let onClose: () -> Void

    var body: some View {
        CalendarDaySheet(
            date: date,
            sections: CalendarDaySheetLogic.roomSections(date: date, events: events),
            addTitle: "＋ 予定を追加",
            path: $path,
            onClose: onClose
        ) { target in
            editor(target)
        }
    }

    @ViewBuilder
    private func editor(_ target: CalendarDayEditorTarget) -> some View {
        switch resolveTarget(target) {
        case .create(let defaultDate):
            editorContent(event: nil, defaultDate: defaultDate)
        case .edit(let event, let defaultDate):
            editorContent(event: event, defaultDate: defaultDate)
        case .unresolved:
            unresolvedTarget
        }
    }

    private func editorContent(event: RoomEventDto?, defaultDate: String) -> some View {
        RoomEventEditorContent(
            roomId: roomId,
            defaultDate: defaultDate,
            event: event,
            onSaved: {
                await onChanged()
                if !path.isEmpty { path.removeLast() }
            },
            onDeleted: {
                await onChanged()
                if !path.isEmpty { path.removeLast() }
            }
        )
        .id(event?.id ?? "new")
    }

    /// rowId が解決できないときは editor を開かない (旧実装の `guard let … else { return }` 相当)。
    /// 空の作成フォームに化けさせないため、push されていたら即座に一覧へ戻す。
    private var unresolvedTarget: some View {
        Color.clear
            .frame(height: 0)
            .onAppear { if !path.isEmpty { path.removeLast() } }
    }

    private enum EditorResolution {
        case create(defaultDate: String)
        case edit(event: RoomEventDto, defaultDate: String)
        case unresolved
    }

    private func resolveTarget(_ target: CalendarDayEditorTarget) -> EditorResolution {
        switch target {
        case .create(let date):
            return .create(defaultDate: date)
        case .edit(let rowId, let date):
            guard let event = resolveRoomEvent(rowId) else { return .unresolved }
            return .edit(event: event, defaultDate: date)
        }
    }
}
