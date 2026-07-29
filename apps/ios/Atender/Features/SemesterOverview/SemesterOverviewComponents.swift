import SwiftUI

struct AttendanceRateHero: View {
    let overall: SemesterOverviewDto.Overall
    let requiredRate: Int

    var body: some View {
        let pct = SemesterOverviewDisplayLogic.pct(rate: overall.toDate.attendanceRate)
        let rateColor = Color.forRate(pct: pct, required: requiredRate)
        VStack(alignment: .leading, spacing: Space.s3) {
            Text("今日までの出席率")
                .font(.atenderSm.weight(.bold))
                .foregroundStyle(Color.textSecondary)
            HStack(alignment: .lastTextBaseline, spacing: Space.s2) {
                Text(pct.map(String.init) ?? "—")
                    .font(.atender5xl.weight(.bold))
                    .foregroundStyle(rateColor)
                if pct != nil {
                    Text("%")
                        .font(.atender2xl.weight(.bold))
                        .foregroundStyle(rateColor)
                }
                Text("\(overall.toDate.effectiveNumerator.clean) / \(overall.toDate.effectiveDenominator.clean)限")
                    .font(.atenderXs)
                    .foregroundStyle(Color.textTertiary)
            }
            RateProgressBar(pct: pct, required: requiredRate)
                .frame(height: 10)
            HStack(alignment: .firstTextBaseline, spacing: Space.s2) {
                Text(SemesterOverviewDisplayLogic.overallActionText(
                    allowedAbsences: overall.allowedAbsences,
                    remainingCount: overall.remainingCount,
                    required: requiredRate
                ))
                .font(.atenderSm.weight(.semibold))
                .foregroundStyle(SemesterOverviewDisplayLogic.overallActionColor(
                    allowedAbsences: overall.allowedAbsences,
                    remainingCount: overall.remainingCount
                ))
                Spacer()
                Text("残り \(overall.remainingCount)限")
                    .font(.atenderXs)
                    .foregroundStyle(Color.textTertiary)
            }
            if overall.unrecordedCount > 0 {
                HStack(spacing: Space.s2) {
                    Rectangle().fill(Color.statusTardy).frame(width: 3)
                    Image(systemName: "exclamationmark.triangle.fill")
                    Text("未記録 \(overall.unrecordedCount) 件 — 記録して")
                    Spacer(minLength: 0)
                }
                .font(.atenderSm.weight(.semibold))
                .foregroundStyle(Color.statusTardy)
                .frame(minHeight: 34)
                .background(Color.statusTardy.opacity(0.15))
                .clipShape(RoundedRectangle(cornerRadius: Radius.timetableCell, style: .continuous))
            }
        }
        .padding(Space.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.bgElevated)
        .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
        .atenderShadow(.card)
    }
}

struct AttendanceCalendar: View {
    let days: [AttendanceDaySummary]
    let startDate: String
    let endDate: String
    let today: String
    let semesterId: String?
    let selectionMode: Bool
    let selectedDates: Set<String>
    let onSelectDay: (String) -> Void
    let onToggleSelectionMode: () -> Void
    let onToggleDate: (String) -> Void
    @Environment(AppEnvironment.self) private var environment
    @State private var anchor: String = CalendarRange.monthFirst(SchoolClock.todayString())
    @State private var eventDates: Set<String> = []

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 3), count: 7)
    private let weekdays = ["日", "月", "火", "水", "木", "金", "土"]

    var body: some View {
        VStack(spacing: Space.s3) {
            HStack {
                monthButton("chevron.left", disabled: SemesterCalendarGrid.atStart(anchor: anchor, start: startDate)) {
                    anchor = CalendarRange.addMonths(anchor, -1)
                }
                Spacer()
                Text(CalendarRange.format(anchor, .yearMonth))
                    .font(.atenderBase.weight(.bold))
                    .foregroundStyle(Color.textPrimary)
                Spacer()
                monthButton("chevron.right", disabled: SemesterCalendarGrid.atEnd(anchor: anchor, end: endDate)) {
                    anchor = CalendarRange.addMonths(anchor, 1)
                }
            }
            HStack {
                Spacer()
                if CalendarRange.monthFirst(anchor) != CalendarRange.monthFirst(today) {
                    chip("今日", active: false) {
                        anchor = SemesterCalendarGrid.clampMonth(today, start: startDate, end: endDate)
                    }
                }
                chip(selectionMode ? "選択中" : "複数選択", active: selectionMode, action: onToggleSelectionMode)
            }
            LazyVGrid(columns: columns, spacing: 3) {
                ForEach(weekdays, id: \.self) { label in
                    Text(label)
                        .font(.atenderXs)
                        .fontWeight(.bold)
                        .foregroundStyle(Color.textTertiary)
                        .frame(maxWidth: .infinity)
                }
                ForEach(SemesterCalendarGrid.cells(monthAnchor: anchor), id: \.self) { iso in
                    dayCell(iso)
                }
            }
            legend
        }
        .padding(Space.s4)
        .background(Color.bgElevated)
        .clipShape(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
        .atenderShadow(.card)
        .accessibilityIdentifier("attendance-calendar")
        .onAppear {
            anchor = SemesterCalendarGrid.clampMonth(today, start: startDate, end: endDate)
        }
        .task(id: "\(anchor):\(semesterId ?? "")") {
            await loadEventDots()
        }
    }

    private var daysByDate: [String: AttendanceDaySummary] {
        Dictionary(days.map { ($0.date, $0) }, uniquingKeysWith: { _, latest in latest })
    }

    private func dayCell(_ iso: String) -> some View {
        let visual = AttendanceDayVisual.dayVisual(summary: daysByDate[iso], isFuture: iso > today)
        let glyphs = AttendanceDayVisual.glyphs(visual.marks)
        let glyphSize: CGFloat = glyphs.count >= 2 ? 12 : 16
        let inMonth = iso.prefix(7) == anchor.prefix(7)
        let inSemester = startDate <= iso && iso <= endDate
        let selected = selectedDates.contains(iso)
        let disabled = selectionMode && !inSemester
        let hasStateStroke = visual.dashed || iso == today || selected
        return Button {
            selectionMode ? onToggleDate(iso) : onSelectDay(iso)
        } label: {
            ZStack(alignment: .topTrailing) {
                ZStack {
                    Color.bgElevated
                    HStack(spacing: 0) {
                        ForEach(Array(AttendanceDayVisual.backgroundSlices(visual.marks).enumerated()), id: \.offset) { _, slice in
                            Rectangle()
                                .fill(slice.color)
                                .frame(maxWidth: .infinity, maxHeight: .infinity)
                        }
                    }
                }
                .clipShape(Circle())
                VStack(spacing: 3) {
                    Text(String(Int(iso.suffix(2)) ?? 0))
                        .font(.atenderSm.weight(.semibold))
                    HStack(spacing: 2) {
                        if glyphs.isEmpty {
                            statusIcon(.none, size: glyphSize)
                        } else {
                            ForEach(Array(glyphs.enumerated()), id: \.offset) { _, mark in
                                statusIcon(mark.icon, size: glyphSize)
                                    .foregroundStyle(mark.iconColor)
                            }
                        }
                    }
                }
                .foregroundStyle(inMonth ? Color.textPrimary : Color.textTertiary)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                if selected {
                    Image(systemName: "checkmark")
                        .font(.system(size: 8, weight: .bold))
                        .foregroundStyle(Color.textOnAccent)
                        .frame(width: 16, height: 16)
                        .background(Color.accent500)
                        .clipShape(Circle())
                        .offset(x: -4, y: 4)
                } else if eventDates.contains(iso) {
                    Circle()
                        .fill(Color.accent500)
                        .frame(width: 8, height: 8)
                        .offset(x: -6, y: 6)
                }
            }
            .aspectRatio(1, contentMode: .fit)
            .overlay {
                if !hasStateStroke {
                    Circle().strokeBorder(Color.borderSubtle, lineWidth: 1)
                }
            }
            .overlay {
                if visual.dashed {
                    Circle()
                        .stroke(Color.statusTardy.opacity(0.40), style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
                }
            }
            .overlay {
                if iso == today {
                    Circle()
                        .stroke(Color.accent500.opacity(0.60), lineWidth: 1)
                }
                if selected {
                    Circle()
                        .stroke(Color.accent500, lineWidth: 2)
                }
            }
            .opacity((inMonth ? 1 : 0.4) * (disabled ? 0.25 : 1))
        }
        .buttonStyle(.plain)
        .disabled(disabled)
    }

    private func monthButton(_ systemName: String, disabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.atenderBase.weight(.bold))
                .frame(width: 44, height: 44)
        }
        .buttonStyle(.plain)
        .foregroundStyle(Color.textPrimary)
        .disabled(disabled)
        .opacity(disabled ? 0.3 : 1)
    }

    private func chip(_ title: String, active: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.atenderXs.weight(.bold))
                .foregroundStyle(active ? Color.textOnAccent : Color.textSecondary)
                .padding(.horizontal, Space.s3)
                .frame(height: 30)
                .background(active ? Color.accent500 : Color.bgMuted)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    private func statusIcon(_ icon: AttendanceDayVisual.Icon, size: CGFloat) -> some View {
        Group {
            switch icon {
            case .check: Image(systemName: "checkmark")
            case .x: Image(systemName: "xmark")
            case .excused:
                Text("公")
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            case .clock: Image(systemName: "clock")
            case .ban: Image(systemName: "nosign")
            case .minus: Image(systemName: "minus")
            case .none: Image(systemName: "minus").opacity(0)
            }
        }
        .font(.system(size: size, weight: .bold))
        .frame(height: size)
    }

    private var legend: some View {
        VStack(alignment: .leading, spacing: Space.s1) {
            HStack(spacing: Space.s2) {
                legendItem(.check, .statusPresent, "出席")
                legendItem(.x, .statusAbsent, "欠席")
                legendItem(.excused, .statusExcused, "公欠")
                legendItem(.clock, .statusTardy, "遅刻・早退")
                legendItem(.ban, .statusSuspended, "休講")
            }
            .lineLimit(1)
            .minimumScaleFactor(0.75)
            Text("− / 破線 = 未記録 ・ ● = 予定")
        }
        .font(.caption2)
        .fontWeight(.bold)
        .foregroundStyle(Color.textTertiary)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func legendItem(_ icon: AttendanceDayVisual.Icon, _ color: Color, _ label: String) -> some View {
        HStack(spacing: 2) {
            statusIcon(icon, size: 14).foregroundStyle(color).frame(width: 14)
            Text(label)
        }
    }

    private func loadEventDots() async {
        let cells = SemesterCalendarGrid.cells(monthAnchor: anchor)
        guard let from = cells.first, let to = cells.last else { return }
        if let events = try? await environment.personalEventRepository.personalEvents(from: from, to: to, semesterId: semesterId) {
            eventDates = Set(events.map(\.date))
        }
    }
}

struct CourseListItem: View {
    let stats: CourseStatsDto
    let requiredRate: Int
    let onTap: () -> Void

    var body: some View {
        let pct = SemesterOverviewDisplayLogic.pct(rate: stats.toDate.attendanceRate)
        let rateColor = Color.forRate(pct: pct, required: requiredRate)
        Button(action: onTap) {
            HStack(spacing: Space.s3) {
                Rectangle().fill(rateColor).frame(width: 4)
                VStack(alignment: .leading, spacing: Space.s2) {
                    HStack(alignment: .firstTextBaseline, spacing: Space.s2) {
                        Text(stats.courseName)
                            .font(.atenderSm.weight(.bold))
                            .foregroundStyle(Color.textPrimary)
                            .lineLimit(1)
                        if stats.counts.unrecorded > 0 {
                            HStack(spacing: 3) {
                                Image(systemName: "exclamationmark.triangle.fill")
                                Text("\(stats.counts.unrecorded)")
                            }
                            .font(.atenderXs.weight(.bold))
                            .foregroundStyle(Color.statusTardy)
                            .padding(.horizontal, Space.s2)
                            .padding(.vertical, Space.s1)
                            .background(Color.statusTardy.opacity(0.18))
                            .clipShape(Capsule())
                        }
                        Spacer()
                        Text(pct.map { "\($0)%" } ?? "—")
                            .font(.atender2xl.weight(.black))
                            .foregroundStyle(rateColor)
                    }
                    RateProgressBar(pct: pct, required: requiredRate)
                        .frame(height: 6)
                    HStack(spacing: 0) {
                        Text("出\(stats.counts.present) 欠\(stats.counts.absent) ・ ")
                            .foregroundStyle(Color.textTertiary)
                        Text(SemesterOverviewDisplayLogic.courseActionText(
                            allowedAbsences: stats.allowedAbsences,
                            remainingCount: stats.remainingCount,
                            allowedAbsenceDays: stats.allowedAbsenceDays
                        ))
                        .foregroundStyle(SemesterOverviewDisplayLogic.courseActionColor(
                            allowedAbsences: stats.allowedAbsences,
                            remainingCount: stats.remainingCount
                        ))
                    }
                    .font(.atenderXs)
                }
                .padding(.vertical, Space.s3)
                .padding(.trailing, Space.s3)
            }
            .background(Color.bgElevated)
            .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
            .atenderShadow(.card)
        }
        .buttonStyle(.plain)
    }
}

struct BulkActionBar: View {
    let count: Int
    let onOpenSheet: () -> Void
    let onCancel: () -> Void

    var body: some View {
        HStack(spacing: Space.s3) {
            Text("\(count)日選択中")
                .font(.atenderSm.weight(.bold))
                .foregroundStyle(Color.textPrimary)
            Spacer()
            AtenderButton(title: "一括操作", variant: .primary, size: .sm, isEnabled: count > 0, action: onOpenSheet)
                .frame(width: 112)
            AtenderButton(title: "キャンセル", variant: .ghost, size: .sm, action: onCancel)
                .frame(width: 104)
        }
        .padding(Space.s3)
        .background(Color.bgElevated)
        .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).stroke(Color.borderDefault, lineWidth: 1))
        .atenderShadow(.sheet)
        .accessibilityIdentifier("bulk-action-bar")
    }
}
