import Foundation

/// 専用「Atender」カレンダーの文字列/色の正典 (§5.1)
enum AtenderCalendarSpec {
    /// ローカライズしない (言語を変えると title 探索が壊れるため)
    static let title = "Atender"
    /// Color.accent500 の light 値。EKCalendar の色は dark 変種を持てない
    static let colorHex = "#1E96E6"
}
