import SwiftUI

struct TimetableGrid: View {
    let daySlots: [DaySlotDto]
    let events: [TimetableEventInput]
    var days: [Int] = [1, 2, 3, 4, 5]
    var onEventTap: ((String) -> Void)?
    var onEmptyCellTap: ((_ displayDayOfWeek: Int, _ periodIndex: Int) -> Void)?
    var height: CGFloat?

    private let headerWidth: CGFloat = 44
    private let headerHeight: CGFloat = 28
    private let dayLabels = ["月", "火", "水", "木", "金", "土", "日"]

    var body: some View {
        let periodIndexes = daySlots.map(\.periodIndex).sorted()
        let targetHeight = height ?? max(320, UIScreen.main.bounds.height - Space.selfTtChrome)
        GeometryReader { proxy in
            let width = proxy.size.width
            let rowCount = max(1, periodIndexes.count)
            let colWidth = max(1, (width - headerWidth) / CGFloat(max(1, days.count)))
            let rowHeight = max(1, (targetHeight - headerHeight) / CGFloat(rowCount))
            let coalesced = TimetableCoalesce.coalesce(events)
            let occupied = occupiedSet(coalesced: coalesced, periodIndexes: periodIndexes)
            ZStack(alignment: .topLeading) {
                background(width: width, colWidth: colWidth, rowHeight: rowHeight, periodIndexes: periodIndexes, occupied: occupied)
                eventLayer(coalesced: coalesced, colWidth: colWidth, rowHeight: rowHeight, periodIndexes: periodIndexes)
            }
        }
        .frame(height: targetHeight)
        .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).stroke(Color.borderSubtle, lineWidth: 1))
    }

    private func background(width: CGFloat, colWidth: CGFloat, rowHeight: CGFloat, periodIndexes: [Int], occupied: Set<String>) -> some View {
        ZStack(alignment: .topLeading) {
            Rectangle().fill(Color.bgBase)
            Rectangle()
                .fill(Color.bgMuted)
                .frame(width: headerWidth, height: headerHeight)
            ForEach(Array(days.enumerated()), id: \.element) { index, day in
                Text(dayLabels[max(0, min(6, day - 1))])
                    .font(.atenderXs)
                    .fontWeight(.semibold)
                    .foregroundStyle(Color.textSecondary)
                    .frame(width: colWidth, height: headerHeight)
                    .background(Color.bgMuted)
                    .position(x: headerWidth + colWidth * CGFloat(index) + colWidth / 2, y: headerHeight / 2)
            }
            ForEach(Array(periodIndexes.enumerated()), id: \.element) { row, period in
                PeriodLabelCell(slot: slot(period))
                    .frame(width: headerWidth, height: rowHeight)
                    .position(x: headerWidth / 2, y: headerHeight + rowHeight * CGFloat(row) + rowHeight / 2)
                ForEach(Array(days.enumerated()), id: \.element) { col, day in
                    let key = "\(day):\(period)"
                    EmptyCell {
                        onEmptyCellTap?(day, period)
                    }
                    .opacity(occupied.contains(key) ? 0 : 1)
                    .frame(width: colWidth, height: rowHeight)
                    .overlay(alignment: .top) { Rectangle().fill(Color.borderSubtle).frame(height: 1) }
                    .overlay(alignment: .leading) { Rectangle().fill(Color.borderSubtle).frame(width: 1) }
                    .position(x: headerWidth + colWidth * CGFloat(col) + colWidth / 2, y: headerHeight + rowHeight * CGFloat(row) + rowHeight / 2)
                }
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
                    HStack(spacing: 2) {
                        ForEach(group) { event in
                            EventTile(title: event.title, color: event.color, subtitle: event.subtitle) {
                                onEventTap?(event.id)
                            }
                        }
                    }
                    .padding(2)
                    .frame(width: colWidth, height: rowHeight * CGFloat(span))
                    .position(x: headerWidth + colWidth * CGFloat(col) + colWidth / 2, y: headerHeight + rowHeight * CGFloat(row) + rowHeight * CGFloat(span) / 2)
                }
            }
        }
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
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var content: some View {
        HStack(spacing: Space.s2) {
            Capsule()
                .fill(Color(hexString: color))
                .frame(width: 3)
            if let leadingSystemImage {
                Image(systemName: leadingSystemImage)
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(Color(hexString: color))
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.atender(12, .semibold))
                    .foregroundStyle(Color.textPrimary)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                if let subtitle, !subtitle.isEmpty {
                    Text(subtitle)
                        .font(.atender(10, .medium))
                        .foregroundStyle(Color.textSecondary)
                        .lineLimit(1)
                }
                if let meta {
                    Text(meta)
                        .font(.atender(10))
                        .foregroundStyle(Color.textTertiary)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 4)
        .padding(.horizontal, 6)
        .background(Color(hexString: color).opacity(0.16))
        .clipShape(RoundedRectangle(cornerRadius: Radius.timetableCell, style: .continuous))
    }
}

struct PeriodLabelCell: View {
    let slot: DaySlotDto

    var body: some View {
        VStack(spacing: 1) {
            Text("\(slot.periodIndex)")
                .font(.atender(12, .bold))
                .foregroundStyle(Color.textPrimary)
            Text(TimeFormatting.minutesToTime(slot.startMinute))
                .font(.atender(8))
                .monospacedDigit()
                .foregroundStyle(Color.textTertiary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.bgMuted)
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
                .background(Color.bgBase)
        }
        .buttonStyle(.plain)
    }
}
