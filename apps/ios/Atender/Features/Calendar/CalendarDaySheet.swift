import SwiftUI

struct CalendarDaySheet<Editor: View>: View {
    let date: String
    let sections: [CalendarDaySection]
    let addTitle: String?
    @Binding var path: NavigationPath
    let onClose: () -> Void
    @ViewBuilder var editor: (CalendarDayEditorTarget) -> Editor

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s4) {
            ForEach(sections) { section in
                VStack(alignment: .leading, spacing: Space.s2) {
                    Text(section.title).font(.footnote).foregroundStyle(Color.textSecondary)
                    if section.rows.isEmpty {
                        if let emptyText = section.emptyText {
                            Text(emptyText).font(.footnote).foregroundStyle(Color.textTertiary)
                        }
                    } else {
                        ForEach(section.rows) { row in
                            CalendarDayRowView(row: row, onTap: row.editorTarget.map { target in { path.append(target) } })
                        }
                    }
                }
            }
            if let addTitle {
                AtenderButton(title: addTitle, variant: .primary) {
                    path.append(CalendarDayEditorTarget.create(date: date))
                }
                .accessibilityIdentifier("day-sheet-add")
            }
        }
        // ★ 外側の accessibilityIdentifier は既定で子孫の identifier を潰す
        //   (実測: これが無いと day-sheet-add がツリーから消える)。コンテナ要素として
        //   宣言することで子 (day-sheet-add) の identifier を残す。
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("calendar-day-sheet")
        .navigationDestination(for: CalendarDayEditorTarget.self) { target in
            ScrollView {
                editor(target)
                    .padding(.horizontal, Space.s5)
                    .padding(.bottom, Space.s5)
            }
            .background(Color.bgElevated)
            .atenderModalDetailHeader(
                title: CalendarDaySheetLogic.editorTitle(target),
                onBack: { if !path.isEmpty { path.removeLast() } },
                onClose: onClose
            )
        }
    }
}

struct CalendarDayRowView: View {
    let row: CalendarDayRow
    let onTap: (() -> Void)?

    var body: some View {
        if let onTap {
            Button(action: onTap) {
                rowBody
            }
            .buttonStyle(.plain)
            .contentShape(Rectangle())
        } else {
            rowBody
        }
    }

    private var rowBody: some View {
        HStack(alignment: .top, spacing: Space.s3) {
            Capsule().fill(Color(hexString: row.colorHex)).frame(width: 2)
            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    Text(row.title).font(.atenderSm.weight(.semibold)).foregroundStyle(Color.textPrimary).lineLimit(1)
                    Spacer()
                    Text(row.detail).font(.footnote).foregroundStyle(Color.textSecondary)
                }
                if row.showsRecurrence || row.meta != nil {
                    HStack(spacing: Space.s1) {
                        if row.showsRecurrence {
                            Image(systemName: "arrow.triangle.2.circlepath")
                                .font(.caption2)
                                .foregroundStyle(Color.textSecondary)
                        }
                        if let meta = row.meta, !meta.isEmpty {
                            Text(meta).font(.footnote).foregroundStyle(Color.textSecondary).lineLimit(1)
                        }
                    }
                }
            }
        }
        .padding(Space.s3)
        .frame(minHeight: 44)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.bgMuted)
        .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
    }
}
