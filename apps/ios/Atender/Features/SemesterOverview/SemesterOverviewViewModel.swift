import Foundation
import Observation

@MainActor
@Observable
final class SemesterOverviewViewModel {
    @ObservationIgnored private let env: AppEnvironment
    private(set) var overview: SemesterOverviewDto?
    private(set) var isLoading = false
    var alertMessage: String?

    init(env: AppEnvironment) {
        self.env = env
    }

    func load(semesterId: String, force: Bool = false) async {
        isLoading = true
        defer { isLoading = false }

        do {
            overview = try await env.semesterRepository.semesterOverview(id: semesterId, force: force)
        } catch {
            alertMessage = error.userFacingMessage
        }
    }

    func reload(semesterId: String) async {
        await load(semesterId: semesterId, force: true)
    }
}
