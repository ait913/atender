import SwiftUI

enum HomeDrawerSection: Equatable {
    case semester
    case contextChips
}

enum HomeDrawer {
    static let dragThreshold: CGFloat = 40

    static func sections(context: HomeContext, hasRooms: Bool) -> [HomeDrawerSection] {
        var result: [HomeDrawerSection] = []
        if context == .self { result.append(.semester) }
        if hasRooms { result.append(.contextChips) }
        return result
    }

    static func resolve(isExpanded: Bool, translationHeight: CGFloat, translationWidth: CGFloat) -> Bool {
        guard abs(translationHeight) > abs(translationWidth) else { return isExpanded }
        if !isExpanded, translationHeight > dragThreshold { return true }
        if isExpanded, translationHeight < -dragThreshold { return false }
        return isExpanded
    }

    static func toggled(_ isExpanded: Bool) -> Bool { !isExpanded }
}

struct HomeTopBar: View {
    @Binding var mode: HomeViewMode
    @Binding var isDrawerExpanded: Bool

    private let drawerAnimation = Animation.spring(response: 0.35, dampingFraction: 0.86)

    var body: some View {
        VStack(spacing: Space.s1) {
            grabberBand
            segmented
        }
    }

    private var grabberBand: some View {
        Capsule()
            .fill(Color.borderEmphasis)
            .frame(width: 42, height: 5)
            .frame(maxWidth: .infinity, minHeight: 36)
            .contentShape(Rectangle())
            .accessibilityIdentifier("home-drawer-grabber")
            .accessibilityAddTraits(.isButton)
            .onTapGesture {
                withAnimation(drawerAnimation) {
                    isDrawerExpanded = HomeDrawer.toggled(isDrawerExpanded)
                }
            }
            .gesture(
                DragGesture(minimumDistance: 10)
                    .onEnded { value in
                        let next = HomeDrawer.resolve(
                            isExpanded: isDrawerExpanded,
                            translationHeight: value.translation.height,
                            translationWidth: value.translation.width
                        )
                        withAnimation(drawerAnimation) { isDrawerExpanded = next }
                    }
            )
    }

    private var segmented: some View {
        Picker("表示", selection: $mode) {
            Text("時間割").tag(HomeViewMode.timetable)
            Text("カレンダー").tag(HomeViewMode.calendar)
        }
        .pickerStyle(.segmented)
        .frame(maxWidth: .infinity)
    }
}

struct HomeDrawerPanel: View {
    let sections: [HomeDrawerSection]
    let semesters: [SemesterDto]
    @Binding var semesterId: String?
    let chipItems: [ContextChipItem]
    let context: HomeContext
    let onSelectContext: (HomeContext) -> Void
    let onAddRoom: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            ForEach(sections, id: \.self) { section in
                switch section {
                case .semester:
                    SemesterMenu(semesters: semesters, semesterId: $semesterId)
                case .contextChips:
                    ContextChips(
                        items: chipItems,
                        selected: context,
                        onChange: onSelectContext,
                        onAddRoom: onAddRoom
                    )
                }
            }
        }
        .padding(Space.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .atenderGlass(in: RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
    }
}
