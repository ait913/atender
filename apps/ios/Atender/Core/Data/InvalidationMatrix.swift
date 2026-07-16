import Foundation

enum Mutation: Equatable {
    case markAllPresent
    case patchAttendance
    case deleteAttendance
    case bulkAttendance
    case bulkClearAttendance
    case courseSuspension(courseId: String)
    case timetableSuspension(date: String?)
    case bulkTimetableSuspension
    case personalEvent(date: String?)
    case deleteCourse
    case userTimetableCreate
    case userTimetableEdit
    case userTimetablePublish
    case userTimetableDelete
    case meUpdate
    case attendanceRuleUpsert
    case semesterCreate
    case semesterUpdate
    case semesterDelete
    case schoolCreate
    case departmentCreate(schoolId: String)
    case roomCreate
    case roomUpdate(id: String)
    case roomJoin(id: String)
    case roomLeave(id: String)
    case roomDelete(id: String)
    case roomMemberRemove(id: String)
    case roomEvent(id: String)
    case icsImport(roomId: String)
    case friendshipAction
    case friendshipAdd
    case templateCopy
}

func invalidationTargets(for mutation: Mutation) -> [QueryKey] {
    switch mutation {
    case .markAllPresent, .patchAttendance:
        return [QueryKey(["stats"]), .semesters(), .dayPrefix()]
    case .deleteAttendance:
        return [QueryKey(["today"]), QueryKey(["stats"]), .semesters(), .dayPrefix()]
    case .bulkAttendance:
        return [.semesters(), QueryKey(["stats"]), .dayPrefix(), QueryKey(["today"]), .timetableSuspensions()]
    case .bulkClearAttendance:
        return [.semesters(), QueryKey(["stats"]), .dayPrefix(), QueryKey(["today"])]
    case .courseSuspension(let courseId):
        return [.courseSuspensions(courseId), .semesters(), QueryKey(["stats"]), .dayPrefix()]
    case .timetableSuspension(let date):
        return compactKeys([.timetableSuspensions(), .dayPrefix(), .semesters(), QueryKey(["stats"]), QueryKey(["today"]), date.map { .dayDetail($0) }])
    case .bulkTimetableSuspension:
        return [.timetableSuspensions(), .dayPrefix(), .semesters(), QueryKey(["stats"]), QueryKey(["today"])]
    case .personalEvent(let date):
        return compactKeys([.personalEvents(), .dayPrefix(), date.map { .dayDetail($0) }])
    case .deleteCourse:
        return [.userTimetables(), QueryKey(["today"]), QueryKey(["stats"]), .semesters(), .dayPrefix()]
    case .userTimetableCreate:
        return [.userTimetables(), QueryKey(["today"]), .semesters()]
    case .userTimetableEdit:
        return [.userTimetables(), QueryKey(["today"]), QueryKey(["stats"]), .semesters(), .rooms()]
    case .userTimetablePublish:
        return [.userTimetables(), .me()]
    case .userTimetableDelete:
        return [.userTimetables(), QueryKey(["today"]), QueryKey(["stats"]), .semesters()]
    case .meUpdate:
        return [.usersSearch(), .semesters(), QueryKey(["stats"])]
    case .attendanceRuleUpsert:
        return [.rules()]
    case .semesterCreate, .semesterUpdate:
        return [.semesters()]
    case .semesterDelete:
        return [.semesters(), QueryKey(["stats"]), .dayPrefix(), QueryKey(["today"]), .userTimetables()]
    case .schoolCreate:
        return [.schools()]
    case .departmentCreate(let schoolId):
        return [.departments(schoolId)]
    case .roomCreate:
        return [.rooms()]
    case .roomUpdate(let id):
        return [.rooms(), .room(id)]
    case .roomJoin(let id):
        return [.rooms(), .roomMembers(id), .room(id)]
    case .roomLeave(let id), .roomDelete(let id):
        return [.rooms(), .room(id)]
    case .roomMemberRemove(let id):
        return [.rooms(), .roomMembers(id), .room(id)]
    case .roomEvent(let id):
        return [.roomEvents(id), .roomWeek(id)]
    case .icsImport(let roomId):
        return [.roomWeek(roomId), .icsImports(roomId)]
    case .friendshipAction:
        return [.friendships(), .usersSearch()]
    case .friendshipAdd:
        return [.friendships()]
    case .templateCopy:
        return [.userTimetables(), .me()]
    }
}

private func compactKeys(_ keys: [QueryKey?]) -> [QueryKey] {
    keys.compactMap { $0 }
}
