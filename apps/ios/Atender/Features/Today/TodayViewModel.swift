import Foundation
import Observation

@MainActor
@Observable
final class TodayViewModel {
    private let apiClient: APIClient

    private(set) var date: String?
    private(set) var occurrences: [OccurrenceDto] = []
    private(set) var isLoading = false
    private(set) var setupRequired = false
    var alertMessage: String?

    init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    func load() async {
        isLoading = true
        setupRequired = false
        defer { isLoading = false }

        do {
            let response = try await apiClient.send(APIEndpoint(path: "/api/today", method: .get), as: TodayResponse.self)
            date = response.date
            occurrences = response.occurrences.sorted { $0.startMinute < $1.startMinute }
        } catch let APIError.api(status, code, message) where status == 403 && code == "SETUP_REQUIRED" {
            setupRequired = true
            alertMessage = message
        } catch {
            alertMessage = error.userFacingMessage
        }
    }

    func markAllPresent() async {
        do {
            let input = MarkAllPresentInput(date: date)
            let response = try await apiClient.send(
                APIEndpoint(path: "/api/attendance/mark-all-present", method: .post, body: input),
                as: MarkAllPresentResponse.self
            )
            date = response.date
            for index in occurrences.indices where occurrences[index].status == nil {
                occurrences[index].status = .present
            }
        } catch let APIError.api(status, code, message) where status == 403 && code == "SETUP_REQUIRED" {
            setupRequired = true
            alertMessage = message
        } catch {
            alertMessage = error.userFacingMessage
        }
    }

    func mark(_ occurrence: OccurrenceDto, status: AttendanceStatus) async {
        guard let index = occurrences.firstIndex(where: { $0.id == occurrence.id }) else {
            return
        }

        let previous = occurrences[index].status
        occurrences[index].status = status

        do {
            let input = MarkAttendanceInput(status: status, note: nil)
            try await apiClient.send(APIEndpoint(path: "/api/attendance/\(occurrence.id)", method: .post, body: input))
        } catch {
            occurrences[index].status = previous
            alertMessage = error.userFacingMessage
        }
    }
}
