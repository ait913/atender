import Foundation

/// 科目別の出席基準の文言 (build 21)。
enum CourseRuleLogic {
    static func footnote(rateOn: Bool, maxOn: Bool, userRate: Int, rate: Int? = nil) -> String {
        switch (rateOn, maxOn) {
        case (false, false): return "未設定の項目は共通の必要出席率（\(userRate)%）で判定します"
        case (true, false): return "この科目は \(rate ?? userRate)% で判定します"
        case (false, true): return "この科目は回数の上限で判定します（共通の必要出席率は使いません）"
        case (true, true): return "出席率と回数の厳しい方で「あと何回休めるか」を出します"
        }
    }

    static func summary(rule: CourseRuleValues, userRate: Int) -> String {
        if rule.requiredAttendanceRate == nil, rule.maxAbsences == nil, rule.tardiesPerAbsence == nil {
            return "共通（\(userRate)%）"
        }
        var parts: [String] = []
        if rule.requiredAttendanceRate == nil, rule.maxAbsences == nil {
            parts.append("共通（\(userRate)%）")
        }
        if let r = rule.requiredAttendanceRate { parts.append("出席率 \(r)%") }
        if let m = rule.maxAbsences { parts.append("欠席 \(m) 回まで") }
        if let n = rule.tardiesPerAbsence { parts.append("遅刻・早退 \(n) 回で欠席 1 回") }
        return parts.joined(separator: " ・ ")
    }
}
