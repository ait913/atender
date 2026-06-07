import SwiftUI
import UIKit

struct MeetingBlock: View {
    let meeting: MeetingDto?
    let course: CourseDto?

    var body: some View {
        Group {
            if let meeting, let course {
                VStack(alignment: .leading, spacing: Space.s1) {
                    Text(course.name)
                        .font(.atenderXs.weight(.semibold))
                        .foregroundStyle(Color.textPrimary)
                        .lineLimit(2)
                        .minimumScaleFactor(0.82)
                    if let room = meeting.room, !room.isEmpty {
                        Text(room)
                            .font(.atenderXs)
                            .foregroundStyle(Color.textSecondary)
                            .lineLimit(1)
                    }
                    if meeting.periodCount > 1 {
                        Text("\(meeting.periodCount)コマ")
                            .font(.atenderXs)
                            .foregroundStyle(Color.textTertiary)
                    }
                }
                .frame(maxWidth: .infinity, minHeight: 56, alignment: .topLeading)
                .padding(Space.s2)
                .background(course.color.swiftUIColor.opacity(0.28))
                .overlay(
                    RoundedRectangle(cornerRadius: Radius.timetableCell, style: .continuous)
                        .stroke(course.color.swiftUIColor.opacity(0.65), lineWidth: 1)
                )
                .clipShape(RoundedRectangle(cornerRadius: Radius.timetableCell, style: .continuous))
            } else {
                Rectangle()
                    .fill(Color.bgElevated.opacity(0.42))
                    .frame(minHeight: 56)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.timetableCell, style: .continuous))
            }
        }
    }
}

private extension Optional where Wrapped == String {
    var swiftUIColor: Color {
        guard let self, let color = UIColor(cssHex: self) else {
            return .accent
        }
        return Color(color)
    }
}

private extension UIColor {
    convenience init?(cssHex: String) {
        let trimmed = cssHex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        guard trimmed.count == 6, let value = Int(trimmed, radix: 16) else {
            return nil
        }
        self.init(
            red: CGFloat((value >> 16) & 0xFF) / 255,
            green: CGFloat((value >> 8) & 0xFF) / 255,
            blue: CGFloat(value & 0xFF) / 255,
            alpha: 1
        )
    }
}
