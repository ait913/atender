import SwiftUI

struct StatusDot: View {
    let status: AttendanceStatus?
    var size: CGFloat = 10

    var body: some View {
        Circle()
            .fill(Color.forStatus(status))
            .frame(width: size, height: size)
            .accessibilityLabel(status?.label ?? "未記録")
    }
}

#Preview("StatusDot Dark") {
    HStack {
        StatusDot(status: .present)
        StatusDot(status: .absent)
        StatusDot(status: .excused)
        StatusDot(status: .tardy)
        StatusDot(status: .earlyLeave)
        StatusDot(status: .cancelled)
        StatusDot(status: nil)
    }
    .padding()
    .background(Color.bgBase)
    .preferredColorScheme(.dark)
}

#Preview("StatusDot Light") {
    HStack {
        StatusDot(status: .present)
        StatusDot(status: .absent)
        StatusDot(status: .excused)
        StatusDot(status: .tardy)
        StatusDot(status: .earlyLeave)
        StatusDot(status: .cancelled)
        StatusDot(status: nil)
    }
    .padding()
    .background(Color.bgBase)
    .preferredColorScheme(.light)
}
