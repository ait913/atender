import SwiftUI

struct NumberStepper: View {
    @Binding var value: Int
    let min: Int
    let max: Int
    let label: String

    var body: some View {
        HStack(spacing: Space.s3) {
            stepButton(systemName: "minus", enabled: value > min) {
                value = NumberStepperLogic.clamp(value - 1, min: min, max: max)
            }
            Text("\(value)")
                .font(.atenderXl)
                .fontWeight(.black)
                .monospacedDigit()
                .foregroundStyle(Color.textPrimary)
                .frame(minWidth: 44)
            stepButton(systemName: "plus", enabled: value < max) {
                value = NumberStepperLogic.clamp(value + 1, min: min, max: max)
            }
        }
        .accessibilityLabel(label)
    }

    private func stepButton(systemName: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.atenderBase)
                .fontWeight(.black)
                .foregroundStyle(Color.textPrimary)
                .frame(width: 44, height: 44)
                .background(Color.bgMuted)
                .clipShape(Circle())
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.45)
    }
}

enum NumberStepperLogic {
    static func clamp(_ v: Int, min: Int, max: Int) -> Int {
        Swift.min(Swift.max(v, min), max)
    }
}
