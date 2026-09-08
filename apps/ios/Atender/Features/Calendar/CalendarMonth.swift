import SwiftUI

enum CalendarMonthHeaderState: Equatable { case idle, refreshing, retryable }

struct CalendarMonthHeader<Accessory: View>: View {
    let monthFirst: String
    let showsSyncWarning: Bool
    let canGoPrevious: Bool
    let canGoNext: Bool
    let state: State
    let onStep: (Int) -> Void
    let onRetry: () -> Void
    private let accessory: () -> Accessory

    typealias State = CalendarMonthHeaderState

    init(
        monthFirst: String,
        showsSyncWarning: Bool,
        canGoPrevious: Bool,
        canGoNext: Bool,
        state: State,
        onStep: @escaping (Int) -> Void,
        onRetry: @escaping () -> Void,
        @ViewBuilder accessory: @escaping () -> Accessory
    ) {
        self.monthFirst = CalendarRange.monthFirst(monthFirst)
        self.showsSyncWarning = showsSyncWarning
        self.canGoPrevious = canGoPrevious
        self.canGoNext = canGoNext
        self.state = state
        self.onStep = onStep
        self.onRetry = onRetry
        self.accessory = accessory
    }

    var body: some View {
        HStack(spacing: Space.s2) {
            Text(CalendarRange.format(monthFirst, .yearMonth))
                .font(.title3)
                .fontWeight(.bold)
                .foregroundStyle(Color.textPrimary)
                .contentTransition(.numericText())
            if showsSyncWarning {
                CalendarSyncWarningButton()
            }
            switch state {
            case .idle:
                EmptyView()
            case .refreshing:
                ProgressView()
            case .retryable:
                Button(action: onRetry) {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Color.accent500)
                        .frame(width: 32, height: 32)
                        .background(Color.bgElevated, in: Circle())
                        .overlay(Circle().stroke(Color.borderSubtle, lineWidth: 1))
                }
                .accessibilityLabel("再読み込み")
            }
            Spacer(minLength: Space.s2)
            accessory()
            Button { onStep(-1) } label: {
                chevron("chevron.left")
            }
            .disabled(!canGoPrevious)
            .opacity(canGoPrevious ? 1 : 0.3)
            .accessibilityLabel("前の月")
            Button { onStep(1) } label: {
                chevron("chevron.right")
            }
            .disabled(!canGoNext)
            .opacity(canGoNext ? 1 : 0.3)
            .accessibilityLabel("次の月")
        }
        .buttonStyle(.plain)
        .frame(height: 44)
    }

    private func chevron(_ name: String) -> some View {
        Image(systemName: name)
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(Color.accent500)
            .frame(width: 32, height: 32)
            .background(Color.bgElevated, in: Circle())
            .overlay(Circle().stroke(Color.borderSubtle, lineWidth: 1))
            .frame(width: 44, height: 44)
            .contentShape(Rectangle())
    }
}

extension CalendarMonthHeader where Accessory == EmptyView {
    init(
        monthFirst: String,
        showsSyncWarning: Bool,
        canGoPrevious: Bool,
        canGoNext: Bool,
        state: State,
        onStep: @escaping (Int) -> Void,
        onRetry: @escaping () -> Void
    ) {
        self.init(
            monthFirst: monthFirst,
            showsSyncWarning: showsSyncWarning,
            canGoPrevious: canGoPrevious,
            canGoNext: canGoNext,
            state: state,
            onStep: onStep,
            onRetry: onRetry,
            accessory: { EmptyView() }
        )
    }
}

struct CalendarMonth: View {
    let anchor: String
    let selectedDate: String
    let events: [CalendarEvent]
    let daySummaries: [String: AttendanceDaySummary]
    var available: CGFloat? = nil
    let onSelectDate: (String) -> Void
    /// 日付セルの長押し。予定の新規作成に使う (旧「+」ボタンの置き換え)
    var onLongPressDate: ((String) -> Void)? = nil
    /// ページャの非可視ページ。true の日セルは Button の a11y 要素を**生成しない**
    /// (`.accessibilityHidden` はページャ内側では無視されるため。CalendarScreen 参照)
    var suppressesAccessibility: Bool = false

    var body: some View {
        let monthFirst = CalendarRange.monthFirst(anchor)
        let range = CalendarRange.monthGridRange(anchorMonthFirst: monthFirst)
        let dates = (0..<42).map { CalendarRange.addDays(range.start, $0) }
        let eventMap = MeetingExpansion.eventsByDate(events)
        let rowHeight = available.map { CalendarMonthLayout.rowHeight(available: $0) } ?? 86
        monthGrid(dates: dates, eventMap: eventMap, monthFirst: monthFirst, rowHeight: rowHeight)
    }

    @ViewBuilder
    private func monthGrid(dates: [String], eventMap: [String: [CalendarEvent]], monthFirst: String, rowHeight: CGFloat) -> some View {
        LazyVGrid(columns: CalendarGrid.columns, spacing: CalendarMonthLayout.rowSpacing) {
            ForEach(Array(dates.enumerated()), id: \.element) { index, date in
                dayCell(date, events: eventMap[date] ?? [], monthFirst: monthFirst, rowHeight: rowHeight)
                    .overlay(alignment: .leading) {
                        if index % CalendarMonthLayout.columnCount != 0 {
                            Rectangle()
                                .fill(AtenderGridLine.color)
                                .frame(width: AtenderGridLine.width)
                                .allowsHitTesting(false)
                        }
                    }
                    .overlay(alignment: .top) {
                        if index / CalendarMonthLayout.columnCount != 0 {
                            Rectangle()
                                .fill(AtenderGridLine.color)
                                .frame(height: AtenderGridLine.width)
                                .allowsHitTesting(false)
                        }
                    }
            }
        }
    }

    private func dayCell(_ date: String, events: [CalendarEvent], monthFirst: String, rowHeight: CGFloat) -> some View {
        let emphasis = CalendarDayStyle.emphasis(
            date: date, todayString: SchoolClock.todayString(),
            monthFirst: monthFirst
        )
        let showsContent = CalendarDayStyle.showsDayContent(date: date, monthFirst: monthFirst)
        let marks = showsContent
            ? Array(AttendanceDayVisual.dayVisual(summary: daySummaries[date], isFuture: false).marks.prefix(3))
            : []
        let visibleEvents = showsContent ? events : []
        // イベント領域は最大 2 行。溢れる日 (>2) は chip を 1 個に減らし、
        // 残り 1 行を「+N」に充てる (番号 + chip1 + +N はどの端末でも rowHeight に収まる)。
        let overflow = visibleEvents.count > 2
        let visibleCount = overflow ? 1 : 2

        return VStack(alignment: .leading, spacing: 3) {
            VStack(spacing: 2) {
                Text(String(Int(date.suffix(2)) ?? 0))
                    .font(.atenderSm)
                    .fontWeight(emphasis == .today ? .bold : .semibold)
                    .foregroundStyle(dayNumberColor(date: date, emphasis: emphasis))
                    .frame(width: 24, height: 24)
                    .background(emphasis == .today ? Color.accent500 : Color.clear)
                    .clipShape(Circle())
                // §2.6: ホームは「ドットのみ」。severity 順に最大 3 個。
                // marks が空でも 6pt を常時確保して、行間で chip の y を揃える
                HStack(spacing: 2) {
                    ForEach(marks, id: \.kind) { mark in
                        Circle().fill(mark.dotColor).frame(width: 6, height: 6)
                    }
                }
                .frame(width: 24, height: 6)
            }
            VStack(alignment: .leading, spacing: 3) {
                ForEach(Array(visibleEvents.prefix(visibleCount))) { event in
                    CalendarDayEventChip(event: event)
                }
                if overflow {
                    Text("+\(visibleEvents.count - visibleCount)")
                        .font(.caption2)
                        .fontWeight(.semibold)
                        .foregroundStyle(Color.textTertiary)
                        .padding(.horizontal, 3)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .frame(minWidth: 0, maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .clipped()
            .allowsHitTesting(false)
        }
        .padding(.horizontal, 3)
        .padding(.vertical, 2)
        .frame(minWidth: 0, maxWidth: .infinity, alignment: .leading)
        .frame(height: rowHeight)
        .background(
            CalendarDayStyle.isSelected(date: date, selectedDate: selectedDate)
                ? Color.calendarSelectedDay : Color.clear,
            in: RoundedRectangle(cornerRadius: Radius.sm, style: .continuous)
        )
        // ★ 背景塗りと当たり判定を分離するため contentShape は絶対に消さない
        .contentShape(Rectangle())
        // ★ Button は使わない。Button 内部のタップ認識と onLongPressGesture が競合し
        //   「微妙に長押ししないとタップ判定にならない」実機 FB になった (build 14)。
        //   長押しを内側・タップを外側に付けると、素早く離したときは長押しが失敗して
        //   タップが即通り、押し続けたときだけ長押しが勝つ
        .conditional(onLongPressDate != nil) { view in
            view.onLongPressGesture(minimumDuration: 0.4) {
                onLongPressDate?(date)
            }
        }
        .onTapGesture { onSelectDate(date) }
        // ★ Button を外したので「ボタンである」意味論を明示的に復元する。
        //   children: .combine は Button が内部でやっていた結合と同じラベル
        //   (例: "6、プログラミング演習、英語") を作るので、既存の
        //   XCUITest / 計測ハーネスの app.buttons[...] がそのまま引ける
        // ★ 非可視ページ (suppressesAccessibility) は children: .ignore にして
        //   ラベルを結合しない = a11y ツリーに日セルが出ない。
        //   .accessibilityHidden で隠す方法はページャ内側では無効 (CalendarScreen 参照)。
        //   ★ 分岐 (_ConditionalContent) にすると月がめくれるたびに 42 セル x 3 ページが
        //     作り直され、スクロール中のページング gesture が壊れる (#B45/#R2 が落ちる) ので、
        //     modifier の**引数だけ**を切り替えて view の identity は動かさない。
        .accessibilityElement(children: suppressesAccessibility ? .ignore : .combine)
        .accessibilityAddTraits(suppressesAccessibility ? [] : .isButton)
        .accessibilityAction { onSelectDate(date) }
        .conditional(onLongPressDate != nil) { inner in
            inner.accessibilityAction(named: "予定を追加") { onLongPressDate?(date) }
        }
    }

    private func dayNumberColor(date: String, emphasis: CalendarDayEmphasis) -> Color {
        switch emphasis {
        case .today: return Color.textOnAccent
        case .outsideMonth: return weekdayColor(index: weekdayIndex(date), outsideMonth: true)
        case .normal: return weekdayColor(index: weekdayIndex(date), outsideMonth: false)
        }
    }

    private func weekdayColor(index: Int, outsideMonth: Bool) -> Color {
        let color: Color
        switch index {
        case 5:
            color = Color(hexString: "#0091FF")
        case 6:
            color = Color(hexString: "#E5484D")
        default:
            color = Color.textPrimary
        }
        return outsideMonth ? color.opacity(0.38) : color
    }

    private func weekdayIndex(_ date: String) -> Int {
        guard let parsed = CalendarRange.parse(date) else { return 0 }
        let weekday = CalendarRange.utcCalendar.component(.weekday, from: parsed)
        return weekday == 1 ? 6 : weekday - 2
    }
}

struct CalendarWeekdayHeader: View {
    private let labels = ["月", "火", "水", "木", "金", "土", "日"]

    var body: some View {
        LazyVGrid(columns: CalendarGrid.columns, spacing: CalendarMonthLayout.rowSpacing) {
            ForEach(Array(labels.enumerated()), id: \.offset) { index, label in
                Text(label)
                    .font(.atenderXs)
                    .fontWeight(.bold)
                    .lineLimit(1)
                    .foregroundStyle(weekdayColor(index: index))
                    .frame(minWidth: 0, maxWidth: .infinity)
                    .frame(height: CalendarMonthLayout.weekdayHeaderHeight)
            }
        }
        .frame(height: CalendarMonthLayout.weekdayHeaderHeight)
        .background(Color.bgMuted)
    }

    private func weekdayColor(index: Int) -> Color {
        switch index {
        case 5:
            return Color(hexString: "#0091FF")
        case 6:
            return Color(hexString: "#E5484D")
        default:
            return Color.textPrimary
        }
    }
}

enum CalendarGrid {
    /// 曜日ヘッダーと日セルが共有する列定義 (別々に幅を計算しない)
    static var columns: [GridItem] {
        Array(repeating: GridItem(.flexible(minimum: 0), spacing: CalendarMonthLayout.columnSpacing),
              count: CalendarMonthLayout.columnCount)
    }
}

struct CalendarDayEventChip: View {
    let event: CalendarEvent

    var body: some View {
        Text(CalendarEventDisplay.eventTitle(event))
            .font(.caption2)
            .fontWeight(.semibold)
            .lineLimit(1)
            .foregroundStyle(Color.textPrimary)
            .padding(.leading, 4)
            .padding(.trailing, 4)
            .frame(maxWidth: .infinity, alignment: .leading)
            .frame(height: 14)
            .background(Color.opaqueTint(hex: event.color, ratio: Color.surfaceTintRatio, base: .bgElevated))
            .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
    }
}
