import SwiftUI

struct TimetableGrid: View {
    let daySlots: [DaySlotDto]
    let events: [TimetableEventInput]
    var days: [Int] = [1, 2, 3, 4, 5]
    var onEventTap: ((String) -> Void)?
    var onEmptyCellTap: ((_ displayDayOfWeek: Int, _ periodIndex: Int) -> Void)?
    var available: CGFloat
    var todayDisplayDay: Int?
    var currentPeriodIndex: Int?

    private let headerWidth: CGFloat = 44
    private let dayLabels = ["月", "火", "水", "木", "金", "土", "日"]

    var body: some View {
        let periodIndexes = Array(Set(daySlots.map(\.periodIndex))).sorted()
        let rowCount = max(1, periodIndexes.count)
        let rowHeight = TimetableGridLayout.rowHeight(available: available, rowCount: rowCount)
        let contentHeight = TimetableGridLayout.contentHeight(available: available, rowCount: rowCount)
        GeometryReader { proxy in
            let width = proxy.size.width
            let colWidth = max(1, (width - headerWidth) / CGFloat(max(1, days.count)))
            let coalesced = TimetableCoalesce.coalesce(events)
            let occupied = occupiedSet(coalesced: coalesced, periodIndexes: periodIndexes)
            ZStack(alignment: .topLeading) {
                background(width: width, colWidth: colWidth, rowHeight: rowHeight, contentHeight: contentHeight, periodIndexes: periodIndexes, occupied: occupied)
                eventLayer(coalesced: coalesced, colWidth: colWidth, rowHeight: rowHeight, periodIndexes: periodIndexes)
                currentIntersection(colWidth: colWidth, rowHeight: rowHeight, periodIndexes: periodIndexes)
            }
        }
        .frame(height: contentHeight)
        .clipShape(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
        .atenderShadow(.card)
        .animation(.smooth, value: currentPeriodIndex)
    }

    private func background(width: CGFloat, colWidth: CGFloat, rowHeight: CGFloat, contentHeight: CGFloat, periodIndexes: [Int], occupied: Set<String>) -> some View {
        let rowCount = max(1, periodIndexes.count)
        return ZStack(alignment: .topLeading) {
            Rectangle().fill(Color.bgElevated)
            Rectangle()
                .fill(Color.bgMuted)
                .frame(width: headerWidth, height: TimetableGridLayout.headerHeight)
            if let todayCol {
                Rectangle()
                    .fill(Color.accent500.opacity(0.06))
                    .frame(width: colWidth, height: contentHeight)
                    .position(x: headerWidth + colWidth * CGFloat(todayCol) + colWidth / 2, y: contentHeight / 2)
            }
            ForEach(Array(days.enumerated()), id: \.element) { index, day in
                Text(dayLabels[max(0, min(6, day - 1))])
                    .font(.atenderXs)
                    .fontWeight(day == todayDisplayDay ? .bold : .semibold)
                    .foregroundStyle(day == todayDisplayDay ? Color.accent500 : Color.textSecondary)
                    .frame(width: colWidth, height: TimetableGridLayout.headerHeight)
                    .background(day == todayDisplayDay ? Color.accent500.opacity(0.06) : Color.bgMuted)
                    .position(x: headerWidth + colWidth * CGFloat(index) + colWidth / 2, y: TimetableGridLayout.headerHeight / 2)
            }
            ForEach(Array(periodIndexes.enumerated()), id: \.element) { row, period in
                PeriodLabelCell(slot: slot(period), isCurrent: period == currentPeriodIndex)
                    .frame(width: headerWidth, height: rowHeight)
                    .position(x: headerWidth / 2, y: TimetableGridLayout.headerHeight + rowHeight * CGFloat(row) + rowHeight / 2)
                ForEach(Array(days.enumerated()), id: \.element) { col, day in
                    let key = "\(day):\(period)"
                    EmptyCell {
                        onEmptyCellTap?(day, period)
                    }
                    .opacity(occupied.contains(key) ? 0 : 1)
                    .frame(width: colWidth, height: rowHeight)
                    .position(x: headerWidth + colWidth * CGFloat(col) + colWidth / 2, y: TimetableGridLayout.headerHeight + rowHeight * CGFloat(row) + rowHeight / 2)
                }
            }
            ForEach(1..<rowCount, id: \.self) { row in
                Rectangle()
                    .fill(Color.borderSubtle)
                    .frame(width: width - headerWidth, height: 1)
                    .position(x: headerWidth + (width - headerWidth) / 2, y: TimetableGridLayout.headerHeight + rowHeight * CGFloat(row))
            }
            ForEach(1..<max(1, days.count), id: \.self) { col in
                Rectangle()
                    .fill(Color.borderSubtle)
                    .frame(width: 1, height: contentHeight - TimetableGridLayout.headerHeight)
                    .position(
                        x: headerWidth + colWidth * CGFloat(col),
                        y: TimetableGridLayout.headerHeight + (contentHeight - TimetableGridLayout.headerHeight) / 2
                    )
            }
        }
    }

    private func eventLayer(coalesced: [TimetableEventInput], colWidth: CGFloat, rowHeight: CGFloat, periodIndexes: [Int]) -> some View {
        let groups = Dictionary(grouping: coalesced.filter { days.contains($0.dayOfWeek) && periodIndexes.contains($0.startPeriodIndex) }) {
            "\($0.dayOfWeek):\($0.startPeriodIndex)"
        }
        return ZStack(alignment: .topLeading) {
            ForEach(groups.keys.sorted(), id: \.self) { key in
                if let group = groups[key],
                   let first = group.first,
                   let col = days.firstIndex(of: first.dayOfWeek),
                   let row = periodIndexes.firstIndex(of: first.startPeriodIndex) {
                    let span = min(group.map(\.periodCount).max() ?? 1, periodIndexes.count - row)
                    HStack(alignment: .top, spacing: 2) {
                        ForEach(group) { event in
                            EventTile(title: event.title, color: event.color, subtitle: event.subtitle) {
                                onEventTap?(event.id)
                            }
                        }
                    }
                    .padding(2)
                    .frame(width: colWidth, height: rowHeight * CGFloat(span), alignment: .topLeading)
                    .position(x: headerWidth + colWidth * CGFloat(col) + colWidth / 2, y: TimetableGridLayout.headerHeight + rowHeight * CGFloat(row) + rowHeight * CGFloat(span) / 2)
                }
            }
        }
    }

    @ViewBuilder
    private func currentIntersection(colWidth: CGFloat, rowHeight: CGFloat, periodIndexes: [Int]) -> some View {
        if let todayCol,
           let currentPeriodIndex,
           let row = periodIndexes.firstIndex(of: currentPeriodIndex) {
            RoundedRectangle(cornerRadius: Radius.timetableCell, style: .continuous)
                .stroke(Color.accent500, lineWidth: 2)
                .frame(width: colWidth, height: rowHeight)
                .position(x: headerWidth + colWidth * CGFloat(todayCol) + colWidth / 2, y: TimetableGridLayout.headerHeight + rowHeight * CGFloat(row) + rowHeight / 2)
        }
    }

    private var todayCol: Int? {
        guard let todayDisplayDay else { return nil }
        return days.firstIndex(of: todayDisplayDay)
    }

    private func occupiedSet(coalesced: [TimetableEventInput], periodIndexes: [Int]) -> Set<String> {
        var set = Set<String>()
        for event in coalesced {
            guard let start = periodIndexes.firstIndex(of: event.startPeriodIndex) else { continue }
            for row in start..<min(periodIndexes.count, start + event.periodCount) {
                set.insert("\(event.dayOfWeek):\(periodIndexes[row])")
            }
        }
        return set
    }

    private func slot(_ period: Int) -> DaySlotDto {
        daySlots.first { $0.periodIndex == period } ?? DaySlotDto(periodIndex: period, label: "\(period)限", startMinute: 0, endMinute: 0, isBreak: false)
    }
}

struct EventTile: View {
    let title: String
    let color: String
    var subtitle: String? = nil
    var meta: String? = nil
    var leadingSystemImage: String? = nil
    var onTap: (() -> Void)? = nil

    var body: some View {
        Group {
            if let onTap {
                Button(action: onTap) { content }
                    .buttonStyle(.plain)
            } else {
                content
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private var content: some View {
        HStack(alignment: .top, spacing: Space.s2) {
            Capsule()
                .fill(Color(hexString: color))
                .frame(width: 2)
            if let leadingSystemImage {
                Image(systemName: leadingSystemImage)
                    .font(.caption2)
                    .fontWeight(.bold)
                    .foregroundStyle(Color(hexString: color))
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundStyle(Color.textPrimary)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                if let subtitle, !subtitle.isEmpty {
                    Text(subtitle)
                        .font(.caption2)
                        .fontWeight(.medium)
                        .foregroundStyle(Color.opaqueTint(hex: color, ratio: 0.70, base: .eventMixTarget))
                        .lineLimit(1)
                }
                if let meta {
                    Text(meta)
                        .font(.caption2)
                        .foregroundStyle(Color.textTertiary)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 4)
        .padding(.horizontal, 6)
        .background(Color.opaqueTint(hex: color, ratio: Color.surfaceTintRatio, base: .bgElevated))
        .clipShape(RoundedRectangle(cornerRadius: Radius.timetableCell, style: .continuous))
    }
}

struct PeriodLabelCell: View {
    let slot: DaySlotDto
    var isCurrent = false

    var body: some View {
        VStack(spacing: 1) {
            Text("\(slot.periodIndex)")
                .font(.caption)
                .fontWeight(.bold)
                .foregroundStyle(isCurrent ? Color.textOnAccent : Color.textPrimary)
            Text(TimeFormatting.minutesToTime(slot.startMinute))
                .font(.caption2)
                .monospacedDigit()
                .foregroundStyle(isCurrent ? Color.textOnAccent.opacity(0.9) : Color.textTertiary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(isCurrent ? Color.accent500 : Color.bgMuted)
    }
}

struct EmptyCell: View {
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            Text("+")
                .font(.atenderLg)
                .fontWeight(.bold)
                .foregroundStyle(Color.textTertiary.opacity(0))
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.bgElevated)
        }
        .buttonStyle(.plain)
    }
}
