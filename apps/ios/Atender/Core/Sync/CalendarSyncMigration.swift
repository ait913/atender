/// UserDefaults の生値から移行後の書き出し設定を決める純ロジック。
enum CalendarSyncMigration {
    /// 旧「授業」設定が明示的に OFF の場合だけ、書き出しを OFF にする。
    static func exportEnabledAfterMigration(current: Bool, exportCoursesRaw: Bool?) -> Bool {
        exportCoursesRaw == false ? false : current
    }

    /// 移行が完了したときに削除する旧設定キー。
    static let obsoleteKeys = [
        "atender.eventkit.exportCourses",
        "atender.eventkit.exportPersonal",
        "atender.eventkit.linkedCalendarIds",
        "atender.eventkit.promptDismissed",
        "atender.eventkit.legacyPushCleanupDone",
    ]
}
