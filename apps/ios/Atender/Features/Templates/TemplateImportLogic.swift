enum TemplateImportDecision: Equatable {
    case copy
    case replaceSilently
    case confirmReplace(courseCount: Int)
}

enum TemplateImportLogic {
    static func decide(existing: UserTimetableDto?) -> TemplateImportDecision {
        guard let existing else { return .copy }
        if existing.meetings.isEmpty && existing.courses.isEmpty { return .replaceSilently }
        return .confirmReplace(courseCount: existing.courses.count)
    }

    static func copyInput(semesterId: String, decision: TemplateImportDecision) -> TemplateCopyInput {
        TemplateCopyInput(semesterId: semesterId, title: nil, replaceExisting: decision == .copy ? nil : true)
    }
}
