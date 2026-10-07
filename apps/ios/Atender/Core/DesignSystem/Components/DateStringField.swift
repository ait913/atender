import SwiftUI

struct DateStringField: View {
    let label: String
    @Binding var date: String

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s2) {
            Text(label)
                .font(.atenderXs)
                .fontWeight(.bold)
                .foregroundStyle(Color.textSecondary)
            DatePicker("", selection: Binding(
                get: { CalendarRange.parse(date) ?? CalendarRange.parse(SchoolClock.todayString()) ?? Date() },
                set: { date = CalendarRange.yyyyMMdd($0) }
            ), displayedComponents: .date)
            .labelsHidden()
            .datePickerStyle(.compact)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
