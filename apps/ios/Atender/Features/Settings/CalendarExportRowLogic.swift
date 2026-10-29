/// 権限と書き出し設定から設定行の表示を決める。
enum CalendarExportRowLogic {
    static func trailingText(access: EventKitAccess, exportEnabled: Bool) -> String {
        guard access == .fullAccess else { return "未設定" }
        return exportEnabled ? "オン" : "オフ"
    }
}
