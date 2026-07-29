import SwiftUI

enum RecurrencePresetKind: String, CaseIterable {
    case none, daily, weekly, weekday, monthlyByMonthDay, monthlyByDay, yearly, custom
}

enum RecurrenceSpecLogic {
    static let weekdayCodes = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"]
    static let weekdayLabels = ["月", "火", "水", "木", "金", "土", "日"]
    private static let weekdayCodesFromUnit = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"]

    static func weekdayCode(of start: Date) -> String {
        let index = SchoolClock.calendar.component(.weekday, from: start) - 1
        return weekdayCodesFromUnit[max(0, min(6, index))]
    }

    static func label(for code: String) -> String {
        guard let index = weekdayCodes.firstIndex(of: code) else { return code }
        return weekdayLabels[index]
    }

    static func sortedWeekdays(_ codes: [String]) -> [String] {
        weekdayCodes.filter { codes.contains($0) }
    }

    static func day(of start: Date) -> Int { SchoolClock.calendar.component(.day, from: start) }
    static func month(of start: Date) -> Int { SchoolClock.calendar.component(.month, from: start) }
    static func ordinal(of start: Date) -> Int { (day(of: start) - 1) / 7 + 1 }

    /// プリセット -> spec。custom / none は nil を返す
    static func spec(for preset: RecurrencePresetKind, start: Date) -> RecurrenceSpecDto? {
        let never = RecurrenceEndDto(kind: "never")
        switch preset {
        case .none, .custom:
            return nil
        case .daily:
            return RecurrenceSpecDto(freq: "DAILY", interval: 1, byDay: [], monthlyMode: nil, end: never)
        case .weekly:
            return RecurrenceSpecDto(freq: "WEEKLY", interval: 1, byDay: [weekdayCode(of: start)], monthlyMode: nil, end: never)
        case .weekday:
            return RecurrenceSpecDto(freq: "WEEKLY", interval: 1, byDay: ["MO", "TU", "WE", "TH", "FR"], monthlyMode: nil, end: never)
        case .monthlyByMonthDay:
            return RecurrenceSpecDto(freq: "MONTHLY", interval: 1, byDay: [], monthlyMode: "BYMONTHDAY", end: never)
        case .monthlyByDay:
            return RecurrenceSpecDto(freq: "MONTHLY", interval: 1, byDay: [], monthlyMode: "BYDAY", end: never)
        case .yearly:
            return RecurrenceSpecDto(freq: "YEARLY", interval: 1, byDay: [], monthlyMode: nil, end: never)
        }
    }

    /// spec -> どのプリセットか。どれとも一致しなければ .custom、nil なら .none
    static func preset(for spec: RecurrenceSpecDto?, start: Date) -> RecurrencePresetKind {
        guard let spec else { return .none }
        for candidate in RecurrencePresetKind.allCases where candidate != .none {
            if let expected = self.spec(for: candidate, start: start), expected == spec { return candidate }
        }
        return .custom
    }

    /// 表示文 (Web と同一文字列)
    static func describe(_ spec: RecurrenceSpecDto?, start: Date) -> String {
        guard let spec else { return "繰り返しなし" }
        let base = baseText(spec, start: start)
        switch spec.end.kind {
        case "until":
            return "\(base) ・\(untilText(spec.end.date ?? "")) まで"
        case "count":
            return "\(base) ・\(spec.end.count ?? 0)回"
        default:
            return base
        }
    }

    private static func untilText(_ date: String) -> String {
        date.replacingOccurrences(of: "-", with: "/")
    }

    private static func baseText(_ spec: RecurrenceSpecDto, start: Date) -> String {
        switch spec.freq {
        case "DAILY":
            return spec.interval == 1 ? "毎日" : "\(spec.interval)日ごと"
        case "WEEKLY":
            let days = sortedWeekdays(spec.byDay.isEmpty ? [weekdayCode(of: start)] : spec.byDay)
            if spec.interval == 1, days == ["MO", "TU", "WE", "TH", "FR"] { return "毎週 平日" }
            let labels = days.map(label(for:)).joined(separator: ", ")
            return spec.interval == 1 ? "毎週 \(labels)" : "\(spec.interval)週ごと \(labels)"
        case "MONTHLY":
            let prefix = spec.interval == 1 ? "毎月" : "\(spec.interval)ヶ月ごと"
            if spec.monthlyMode == "BYDAY" {
                let ord = ordinal(of: start)
                let ordText = ord == 5 ? "最終" : "第\(ord)"
                return "\(prefix) \(ordText)\(label(for: weekdayCode(of: start)))曜"
            }
            return "\(prefix) \(day(of: start))日"
        default:
            let prefix = spec.interval == 1 ? "毎年" : "\(spec.interval)年ごと"
            return "\(prefix) \(month(of: start))月\(day(of: start))日"
        }
    }
}

struct RecurrenceSpecPicker: View {
    @Binding var spec: RecurrenceSpecDto?
    let start: Date

    @State private var isCustom = false

    private var preset: RecurrencePresetKind {
        isCustom ? .custom : RecurrenceSpecLogic.preset(for: spec, start: start)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s2) {
            HStack {
                Text("繰り返し").font(.atenderSm).foregroundStyle(Color.textSecondary)
                Spacer()
                Picker("繰り返し", selection: Binding(
                    get: { preset },
                    set: { next in
                        isCustom = next == .custom
                        if next == .custom {
                            if spec == nil { spec = RecurrenceSpecLogic.spec(for: .daily, start: start) }
                        } else {
                            spec = RecurrenceSpecLogic.spec(for: next, start: start)
                        }
                    }
                )) {
                    ForEach(RecurrencePresetKind.allCases, id: \.self) { kind in
                        Text(presetLabel(kind)).tag(kind)
                    }
                }
                .pickerStyle(.menu)
            }

            if preset == .custom, let current = spec {
                customEditor(current)
            }

            Text(RecurrenceSpecLogic.describe(spec, start: start))
                .font(.footnote)
                .foregroundStyle(Color.textSecondary)
        }
    }

    private func presetLabel(_ kind: RecurrencePresetKind) -> String {
        switch kind {
        case .none: return "なし"
        case .daily: return "毎日"
        case .weekly: return "毎週 \(RecurrenceSpecLogic.label(for: RecurrenceSpecLogic.weekdayCode(of: start)))"
        case .weekday: return "毎週 平日"
        case .monthlyByMonthDay: return "毎月 \(RecurrenceSpecLogic.day(of: start))日"
        case .monthlyByDay:
            let ord = RecurrenceSpecLogic.ordinal(of: start)
            let ordText = ord == 5 ? "最終" : "第\(ord)"
            return "毎月 \(ordText)\(RecurrenceSpecLogic.label(for: RecurrenceSpecLogic.weekdayCode(of: start)))曜"
        case .yearly: return "毎年 \(RecurrenceSpecLogic.month(of: start))月\(RecurrenceSpecLogic.day(of: start))日"
        case .custom: return "カスタム…"
        }
    }

    @ViewBuilder
    private func customEditor(_ current: RecurrenceSpecDto) -> some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            HStack {
                Stepper(value: Binding(
                    get: { current.interval },
                    set: { spec?.interval = max(1, min(99, $0)) }
                ), in: 1...99) {
                    Text("間隔 \(current.interval)").font(.atenderSm)
                }
                Picker("単位", selection: Binding(
                    get: { current.freq },
                    set: { next in
                        spec?.freq = next
                        if next == "WEEKLY", spec?.byDay.isEmpty == true {
                            spec?.byDay = [RecurrenceSpecLogic.weekdayCode(of: start)]
                        }
                        if next == "MONTHLY", spec?.monthlyMode == nil {
                            spec?.monthlyMode = "BYMONTHDAY"
                        }
                    }
                )) {
                    Text("日").tag("DAILY")
                    Text("週").tag("WEEKLY")
                    Text("月").tag("MONTHLY")
                    Text("年").tag("YEARLY")
                }
                .pickerStyle(.menu)
            }

            if current.freq == "WEEKLY" {
                HStack(spacing: Space.s1) {
                    ForEach(Array(RecurrenceSpecLogic.weekdayCodes.enumerated()), id: \.offset) { index, code in
                        let selected = current.byDay.contains(code)
                        Button {
                            var next = current.byDay
                            if selected { next.removeAll { $0 == code } } else { next.append(code) }
                            if next.isEmpty { next = [RecurrenceSpecLogic.weekdayCode(of: start)] }
                            spec?.byDay = RecurrenceSpecLogic.sortedWeekdays(next)
                        } label: {
                            Text(RecurrenceSpecLogic.weekdayLabels[index])
                                .font(.atenderSm)
                                .frame(width: 40, height: 44)
                                .background(selected ? Color.accent500 : Color.bgMuted)
                                .foregroundStyle(selected ? Color.textOnAccent : Color.textPrimary)
                                .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }

            if current.freq == "MONTHLY" {
                Picker("月の繰り返し方", selection: Binding(
                    get: { current.monthlyMode ?? "BYMONTHDAY" },
                    set: { spec?.monthlyMode = $0 }
                )) {
                    Text("毎月 \(RecurrenceSpecLogic.day(of: start))日").tag("BYMONTHDAY")
                    Text("毎月 第N曜").tag("BYDAY")
                }
                .pickerStyle(.segmented)
            }

            Picker("終了", selection: Binding(
                get: { current.end.kind },
                set: { kind in
                    switch kind {
                    case "until": spec?.end = RecurrenceEndDto(kind: "until", date: SchoolClock.todayString(start))
                    case "count": spec?.end = RecurrenceEndDto(kind: "count", count: 10)
                    default: spec?.end = RecurrenceEndDto(kind: "never")
                    }
                }
            )) {
                Text("なし").tag("never")
                Text("日付").tag("until")
                Text("回数").tag("count")
            }
            .pickerStyle(.segmented)

            if current.end.kind == "until" {
                DatePicker("終了日", selection: Binding(
                    get: { CalendarRange.parse(current.end.date ?? SchoolClock.todayString(start)) ?? start },
                    set: { spec?.end = RecurrenceEndDto(kind: "until", date: SchoolClock.todayString($0)) }
                ), in: start..., displayedComponents: .date)
            }
            if current.end.kind == "count" {
                Stepper(value: Binding(
                    get: { current.end.count ?? 1 },
                    set: { spec?.end = RecurrenceEndDto(kind: "count", count: max(1, min(730, $0))) }
                ), in: 1...730) {
                    Text("\(current.end.count ?? 1)回").font(.atenderSm)
                }
            }
        }
    }
}
