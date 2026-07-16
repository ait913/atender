import SwiftUI

struct LabeledInput: View {
    let label: String
    @Binding var text: String
    var axis: Axis = .horizontal
    var placeholder: String = ""

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s2) {
            Text(label)
                .font(.atenderXs)
                .fontWeight(.bold)
                .foregroundStyle(Color.textSecondary)
            TextField(placeholder, text: $text, axis: axis)
                .font(.atenderBase)
                .foregroundStyle(Color.textPrimary)
                .padding(Space.s3)
                .background(Color.bgMuted)
                .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
        }
    }
}
