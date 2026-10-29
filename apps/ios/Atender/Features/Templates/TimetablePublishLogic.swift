enum TimetablePublishAction: Equatable {
    case none
    case publish(title: String)
    case unpublish(templateId: String)
}

enum TimetablePublishLogic {
    static func initialToggle(_ timetable: UserTimetableDto?) -> Bool {
        guard let timetable else { return false }
        return timetable.publishedTemplate?.isPublic ?? (timetable.sourceTemplateId == nil)
    }

    static func action(toggle: Bool, title: String, timetable: UserTimetableDto) -> TimetablePublishAction {
        if toggle {
            return timetable.meetings.isEmpty ? .none : .publish(title: title)
        }
        if let published = timetable.publishedTemplate, published.isPublic {
            return .unpublish(templateId: published.id)
        }
        return .none
    }
}
