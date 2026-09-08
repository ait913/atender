import SwiftUI

struct CalendarScreenOptions: Equatable {
    var identifier: String
    var showsSyncBanner: Bool
    var showsSyncWarningGlyph: Bool
    var allowsLongPressCreate: Bool

    static let personal = CalendarScreenOptions(
        identifier: "personal-calendar",
        showsSyncBanner: true, showsSyncWarningGlyph: true, allowsLongPressCreate: true)
    static let room = CalendarScreenOptions(
        identifier: "room-calendar",
        showsSyncBanner: false, showsSyncWarningGlyph: false, allowsLongPressCreate: true)
}

struct CalendarDaySheetContext {
    let date: String
    let path: Binding<NavigationPath>
    let onChanged: () async -> Void
    let onClose: () -> Void
}

enum CalendarScreenLogic {
    enum Body: Equatable { case skeleton, grid, error }

    static func body(hasEverLoaded: Bool, payloadExists: Bool, failed: Bool) -> Body {
        if !hasEverLoaded {
            return failed ? .error : .skeleton
        }
        return .grid
    }

    static func headerState(payloadExists: Bool, loading: Bool, failed: Bool) -> CalendarMonthHeader<EmptyView>.State {
        if loading { return .refreshing }
        if failed { return .retryable }
        return .idle
    }
}

struct CalendarScreen<Extra, DaySheet: View, HeaderAccessory: View>: View {
    private let store: CalendarMonthStore<Extra>
    private let options: CalendarScreenOptions
    private let available: CGFloat
    private let originMonth: String
    private let daySheet: (CalendarDaySheetContext) -> DaySheet
    private let headerAccessory: () -> HeaderAccessory

    @State private var visibleMonth: String?
    @State private var selectedDate: String
    @State private var activeDate: String?
    @State private var dayPath: NavigationPath

    init(
        store: CalendarMonthStore<Extra>,
        options: CalendarScreenOptions,
        available: CGFloat,
        originMonth: String,
        @ViewBuilder daySheet: @escaping (CalendarDaySheetContext) -> DaySheet,
        @ViewBuilder headerAccessory: @escaping () -> HeaderAccessory
    ) {
        self.store = store
        self.options = options
        self.available = available
        self.originMonth = CalendarRange.monthFirst(originMonth)
        self.daySheet = daySheet
        self.headerAccessory = headerAccessory
        _visibleMonth = State(initialValue: store.visibleMonth)
        _selectedDate = State(initialValue: SchoolClock.todayString())
        _activeDate = State(initialValue: nil)
        _dayPath = State(initialValue: NavigationPath())
    }

    var body: some View {
        let month = CalendarRange.monthFirst(visibleMonth ?? store.visibleMonth)
        let months = CalendarWindow.months(origin: originMonth)
        let payload = store.payload(month)
        let loading = store.isLoading(month)
        let failed = store.hasFailed(month)
        ScrollView {
            VStack(spacing: Space.s2) {
                if options.showsSyncBanner {
                    CalendarSyncBanner()
                }
                CalendarMonthHeader(
                    monthFirst: month,
                    showsSyncWarning: options.showsSyncWarningGlyph,
                    canGoPrevious: CalendarWindow.step(from: month, by: -1, origin: originMonth) != nil,
                    canGoNext: CalendarWindow.step(from: month, by: 1, origin: originMonth) != nil,
                    state: CalendarScreenLogic.headerState(payloadExists: payload != nil, loading: loading, failed: failed),
                    onStep: { delta in stepMonth(from: month, delta: delta) },
                    onRetry: { Task { await store.refreshVisible() } },
                    accessory: headerAccessory
                )
                switch CalendarScreenLogic.body(hasEverLoaded: store.hasEverLoaded, payloadExists: payload != nil, failed: failed) {
                case .skeleton:
                    VStack(spacing: Space.s3) {
                        Skeleton(width: nil, height: 40, radius: Radius.md)
                        Skeleton(width: nil, height: 360, radius: Radius.md)
                    }
                case .error:
                    Panel {
                        VStack(spacing: Space.s3) {
                            Text("カレンダーを読み込めませんでした。")
                                .foregroundStyle(Color.textSecondary)
                            AtenderButton(title: "再試行", variant: .secondary, size: .sm) {
                                Task { await store.refreshVisible() }
                            }
                        }
                    }
                case .grid:
                    VStack(spacing: 0) {
                        CalendarWeekdayHeader()
                        CalendarMonthPager(months: months, visibleMonth: $visibleMonth) { pageMonth in
                            let pagePayload = store.payload(pageMonth)
                            CalendarMonth(
                                anchor: pageMonth,
                                selectedDate: selectedDate,
                                events: pagePayload?.events ?? [],
                                daySummaries: pagePayload?.daySummaries ?? [:],
                                available: available,
                                onSelectDate: { date in openDay(date, intent: .view) },
                                onLongPressDate: options.allowsLongPressCreate
                                    ? { date in openDay(date, intent: .create) }
                                    : nil,
                                // ★ 非可視ページの日セルは a11y 要素として生成しない (上の
                                //   .accessibilityHidden はページャ内側では効かないため)
                                suppressesAccessibility: pageMonth != month
                            )
                        }
                    }
                    .background(Color.bgElevated)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
                    .atenderShadow(.card)
                }
            }
        }
        .atenderPageScroll()
        .accessibilityIdentifier(options.identifier)
        .accessibilityElement(children: .contain)
        .overlay { sheetHost }
        .task {
            let initialMonth = CalendarRange.monthFirst(visibleMonth ?? store.visibleMonth)
            await store.setVisible(
                initialMonth,
                prefetch: CalendarWindow.neighbors(of: initialMonth, origin: originMonth)
            )
        }
        .onChange(of: visibleMonth) { _, newMonth in
            guard let newMonth else { return }
            let normalizedMonth = CalendarRange.monthFirst(newMonth)
            // §3.5: ページャの scrollPosition 変更を唯一の月変更源にし、可視月を先に読んでから前後を先読みする。
            Task {
                await store.setVisible(
                    normalizedMonth,
                    prefetch: CalendarWindow.neighbors(of: normalizedMonth, origin: originMonth)
                )
            }
        }
    }

    private var daySheetBinding: Binding<Bool> {
        Binding(get: { activeDate != nil }, set: { if !$0 { activeDate = nil } })
    }

    @ViewBuilder
    private var sheetHost: some View {
        if let date = activeDate {
            BottomSheet(title: PersonalDaySheetFormat.heading(date), isPresented: daySheetBinding, navigationPath: $dayPath) {
                daySheet(CalendarDaySheetContext(
                    date: date,
                    path: $dayPath,
                    onChanged: { await store.refreshVisible() },
                    onClose: { activeDate = nil }
                ))
            }
        }
    }

    private func openDay(_ date: String, intent: CalendarDayIntent) {
        selectedDate = date
        dayPath = NavigationPath(CalendarDaySheetLogic.initialPath(intent: intent, date: date))
        activeDate = date
    }

    private func stepMonth(from month: String, delta: Int) {
        guard let next = CalendarWindow.step(from: month, by: delta, origin: originMonth) else { return }
        visibleMonth = next
    }
}

struct CalendarMonthPager<Content: View>: View {
    let months: [String]
    @Binding var visibleMonth: String?
    @ViewBuilder var content: (String) -> Content

    var body: some View {
        // §3.5: 49 ページを最初から並べる。index リセットを書かず、1 スワイプ = 1 ヶ月を保つ。
        ScrollView(.horizontal) {
            LazyHStack(spacing: 0) {
                ForEach(months, id: \.self) { month in
                    content(month)
                        .containerRelativeFrame(.horizontal)
                        // ★ 意味論としての宣言。ただし **この modifier は単独では効かない**。
                        //   実測 (2026-07-30, iPhone 16 / iOS 18.2): ページング用の水平
                        //   ScrollView + LazyHStack の内側では accessibilityHidden も
                        //   accessibilityElement(children:) も黙って無視され、ページ /
                        //   LazyVGrid / 日セルのどの階層に付けても a11y ツリーから
                        //   消えなかった (日セル 126 個 = 42 x 3 のまま)。同じ modifier を
                        //   ページャの**外側** (曜日ヘッダー・ページャ全体) に付けると効く。
                        //   実効的な抑止は CalendarMonth(suppressesAccessibility:) 側 =
                        //   「隠す」ではなく「a11y 要素を作らない」で行う。
                        .accessibilityHidden(month != visibleMonth)
                }
            }
            .scrollTargetLayout()
        }
        .scrollTargetBehavior(.paging)
        .scrollPosition(id: $visibleMonth)
        .scrollIndicators(.hidden)
        .sensoryFeedback(.selection, trigger: visibleMonth)
    }
}

extension CalendarScreen where HeaderAccessory == EmptyView {
    init(
        store: CalendarMonthStore<Extra>,
        options: CalendarScreenOptions,
        available: CGFloat,
        originMonth: String,
        @ViewBuilder daySheet: @escaping (CalendarDaySheetContext) -> DaySheet
    ) {
        self.init(
            store: store,
            options: options,
            available: available,
            originMonth: originMonth,
            daySheet: daySheet,
            headerAccessory: { EmptyView() }
        )
    }
}

struct CalendarModePicker: View {
    @Binding var selection: HomeViewMode
    var identifier: String = "home-mode-picker"

    var body: some View {
        Picker("表示", selection: $selection) {
            Text("時間割").tag(HomeViewMode.timetable)
            Text("カレンダー").tag(HomeViewMode.calendar)
        }
        .pickerStyle(.segmented)
        .frame(maxWidth: .infinity)
        .accessibilityIdentifier(identifier)
    }
}
