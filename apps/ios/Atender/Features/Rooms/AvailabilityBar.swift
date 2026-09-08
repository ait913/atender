import SwiftUI

struct AvailabilityBar: View {
    let date: String
    let members: [RoomWeekDto.Member]
    let events: [CalendarEvent]
    let expanded: Bool
    let onToggle: () -> Void

    var body: some View {
        let result = RoomAvailability.compute(members: members, events: events)
        VStack(alignment: .leading, spacing: Space.s3) {
            HStack {
                Text("\(CalendarRange.format(date, .monthDay)) の空き時間")
                    .font(.atenderBase)
                    .fontWeight(.bold)
                    .foregroundStyle(Color.textPrimary)
                Spacer()
                Button(action: onToggle) {
                    Image(systemName: expanded ? "chevron.up" : "chevron.down")
                        .frame(width: 40, height: 40)
                        .background(Color.textPrimary.opacity(0.06))
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
            }
            HStack {
                Text("").frame(width: 44)
                ForEach(9...18, id: \.self) { hour in
                    Text("\(hour)").font(.caption2).fontWeight(.bold).foregroundStyle(Color.textTertiary).frame(maxWidth: .infinity)
                }
            }
            BarRow(label: "全員", busyCounts: result.combined, total: max(1, members.count), color: nil)
            if expanded {
                ForEach(members) { member in
                    let busy = result.perMember.first { $0.userId == member.userId }?.busy ?? Array(repeating: false, count: 18)
                    BarRow(label: RoomCalendarLogic.memberName(name: member.name, handle: member.handle), busyCounts: busy.map { $0 ? 1 : 0 }, total: 1, color: member.color)
                }
            }
        }
        .padding(Space.s4)
        .background(Color.bgElevated)
        .clipShape(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
        .atenderShadow(.card)
        .accessibilityIdentifier("availability-bar")
    }
}

private struct BarRow: View {
    let label: String
    let busyCounts: [Int]
    let total: Int
    let color: String?

    var body: some View {
        HStack(spacing: Space.s2) {
            Text(label)
                .font(.caption2).fontWeight(.bold)
                .foregroundStyle(Color.textSecondary)
                .lineLimit(1)
                .frame(width: 44, alignment: .leading)
            HStack(spacing: 1) {
                ForEach(0..<18, id: \.self) { index in
                    let count = index < busyCounts.count ? busyCounts[index] : 0
                    let ratio = total == 0 ? 0 : Double(count) / Double(total)
                    Rectangle()
                        .fill(ratio == 0 ? Color.clear : (color.map { Color(hexString: $0).opacity(ratio) } ?? Color.accent500.opacity(ratio)))
                        .frame(maxWidth: .infinity)
                }
            }
            .frame(height: 20)
            .background(Color.textPrimary.opacity(0.04))
            .clipShape(Capsule())
        }
    }
}
