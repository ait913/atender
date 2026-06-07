import SwiftUI

struct OccurrenceRow: View {
    let occurrence: OccurrenceDto

    var body: some View {
        HStack(spacing: Space.s3) {
            VStack(spacing: Space.s1) {
                Text("\(occurrence.periodIndex)")
                    .font(.atenderLg.weight(.bold))
                    .foregroundStyle(Color.textPrimary)
                Text("限")
                    .font(.atenderXs)
                    .foregroundStyle(Color.textTertiary)
            }
            .frame(width: 40)

            VStack(alignment: .leading, spacing: Space.s1) {
                Text(occurrence.courseName)
                    .font(.atenderBase.weight(.semibold))
                    .foregroundStyle(Color.textPrimary)
                    .lineLimit(1)
                HStack(spacing: Space.s2) {
                    Text("\(occurrence.startMinute.hhmm)-\(occurrence.endMinute.hhmm)")
                    if let room = occurrence.room, !room.isEmpty {
                        Text(room)
                    }
                }
                .font(.atenderSm)
                .foregroundStyle(Color.textSecondary)
                .lineLimit(1)
            }

            Spacer(minLength: Space.s2)
            StatusDot(status: occurrence.status, size: 12)
        }
        .padding(Space.s3)
        .background(Color.bgElevated)
        .clipShape(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
    }
}

extension Int {
    var hhmm: String {
        let hour = self / 60
        let minute = self % 60
        return String(format: "%02d:%02d", hour, minute)
    }
}
