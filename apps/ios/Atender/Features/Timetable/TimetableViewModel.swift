import Foundation
import Observation

@MainActor
@Observable
final class TimetableViewModel {
    private let apiClient: APIClient
    private let defaultSemesterId: String?

    private(set) var timetable: UserTimetableDto?
    private(set) var isLoading = false
    var alertMessage: String?

    init(apiClient: APIClient, defaultSemesterId: String?) {
        self.apiClient = apiClient
        self.defaultSemesterId = defaultSemesterId
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let response = try await apiClient.send(
                APIEndpoint(path: "/api/user-timetables", method: .get),
                as: UserTimetableListResponse.self
            )
            let timetables = response.userTimetables
            if let defaultSemesterId, let match = timetables.first(where: { $0.semesterId == defaultSemesterId }) {
                timetable = match
            } else {
                timetable = timetables.sorted { $0.createdAt > $1.createdAt }.first
            }
        } catch {
            alertMessage = error.userFacingMessage
        }
    }
}
