import Foundation
import Observation

@MainActor
@Observable
final class SemesterOverviewViewModel {
    private let apiClient: APIClient
    private let semesterId: String

    private(set) var overview: SemesterOverviewDto?
    private(set) var isLoading = false
    var alertMessage: String?

    init(apiClient: APIClient, semesterId: String) {
        self.apiClient = apiClient
        self.semesterId = semesterId
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }

        do {
            overview = try await apiClient.send(APIEndpoint(path: "/api/semesters/\(semesterId)/overview", method: .get), as: SemesterOverviewDto.self)
        } catch {
            alertMessage = error.userFacingMessage
        }
    }
}
