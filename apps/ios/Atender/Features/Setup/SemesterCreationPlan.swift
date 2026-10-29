enum SemesterCreationContext: Equatable {
    case onboarding, rollover
}

enum SemesterCreationStep: Equatable {
    case createSemester
    case copyTemplate(templateId: String)
    case setDefaultSemester
    case refreshMe
}

enum SemesterCreationPlan {
    static func steps(context: SemesterCreationContext, createdSemesterId: String?,
                      templateId: String?, templateCopied: Bool) -> [SemesterCreationStep] {
        var result: [SemesterCreationStep] = []
        if createdSemesterId == nil { result.append(.createSemester) }
        if let templateId, !templateCopied { result.append(.copyTemplate(templateId: templateId)) }
        result.append(.setDefaultSemester)
        if context == .onboarding { result.append(.refreshMe) }
        return result
    }
}
