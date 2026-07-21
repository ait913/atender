import SwiftUI

struct PeriodChips: View {
    @Binding var value: [Int]
    let periodCount: Int
    var disabled = false

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 40, maximum: 44), spacing: Space.s1)], alignment: .leading, spacing: Space.s1) {
            ForEach(1...max(1, periodCount), id: \.self) { period in
                let selected = value.contains(period)
                Button {
                    guard !disabled else { return }
                    if selected {
                        value.removeAll { $0 == period }
                    } else {
                        value.append(period)
                    }
                    value = Array(Set(value)).sorted()
                } label: {
                    Text("\(period)")
                        .font(.atenderSm)
                        .fontWeight(.bold)
                        .foregroundStyle(selected ? Color.textOnAccent : Color.textPrimary)
                        .frame(minWidth: 40, minHeight: 40)
                        .background(selected ? Color.accent500 : Color.bgBase)
                        .clipShape(Capsule())
                        .overlay(Capsule().stroke(selected ? Color.accent500 : Color.borderDefault, lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
        }
    }
}

struct PeriodChipsPreview: View {
    let periods: [Int]

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if periods.isEmpty {
                Text("時限を選択してください")
            } else {
                Text("選択: \(Array(Set(periods)).sorted().map { "\($0)限" }.joined(separator: "・"))")
                Text("→ \(PeriodGrouping.renderPreview(periods))")
            }
        }
        .font(.atenderSm)
        .foregroundStyle(Color.textSecondary)
    }
}

struct DayChips: View {
    @Binding var value: [Int]
    var disabled = false
    private let labels = ["月", "火", "水", "木", "金", "土", "日"]

    var body: some View {
        HStack(spacing: Space.s2) {
            ForEach(1...7, id: \.self) { day in
                let selected = value.contains(day)
                Button {
                    guard !disabled else { return }
                    if selected { value.removeAll { $0 == day } } else { value.append(day) }
                    value = Array(Set(value)).sorted()
                } label: {
                    Text(labels[day - 1])
                        .font(.atenderSm)
                        .fontWeight(.bold)
                        .foregroundStyle(selected ? Color.textOnAccent : Color.textPrimary)
                        .frame(width: 38, height: 38)
                        .background(selected ? Color.accent500 : Color.bgBase)
                        .clipShape(Circle())
                        .overlay(Circle().stroke(selected ? Color.accent500 : Color.borderDefault, lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
        }
    }
}
