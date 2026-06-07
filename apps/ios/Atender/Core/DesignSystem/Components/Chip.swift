import SwiftUI

struct Chip: View {
    let label: String
    var selected = false

    var body: some View {
        Text(label)
            .font(.atenderSm.weight(.semibold))
            .foregroundStyle(selected ? Color.white : Color.textSecondary)
            .padding(.horizontal, Space.s3)
            .padding(.vertical, Space.s2)
            .background(selected ? Color.accent : Color.bgElevated)
            .clipShape(Capsule())
    }
}

#Preview("Chip Dark") {
    HStack {
        Chip(label: "前期", selected: true)
        Chip(label: "後期")
    }
    .padding()
    .background(Color.bgBase)
    .preferredColorScheme(.dark)
}

#Preview("Chip Light") {
    HStack {
        Chip(label: "前期", selected: true)
        Chip(label: "後期")
    }
    .padding()
    .background(Color.bgBase)
    .preferredColorScheme(.light)
}
