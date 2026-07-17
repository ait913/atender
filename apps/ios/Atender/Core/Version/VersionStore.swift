import Foundation
import Observation

@MainActor
@Observable
final class VersionStore {
    private(set) var state: VersionGateState = .unknown
    /// 診断表示用。/version 取得に成功していれば API の commit
    private(set) var apiCommit: String?

    let currentBuild: Int?

    @ObservationIgnored private let session: URLSession
    @ObservationIgnored private let decoder: JSONDecoder

    init(session: URLSession = APIConfig.apiSession, currentBuild: Int? = AppVersion.current) {
        self.session = session
        self.currentBuild = currentBuild
        self.decoder = JSONDecoder()
        self.decoder.keyDecodingStrategy = .useDefaultKeys
    }

    /// 起動時に 1 回。失敗しても state を変えない (フェイルオープン)
    func check() async {
        let url = APIConfig.baseURL.appending(path: "version")
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        do {
            let (data, response) = try await session.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse, (200...299).contains(httpResponse.statusCode) else {
                return
            }
            let version = try decoder.decode(VersionResponse.self, from: data)
            apiCommit = version.commit
            if VersionGate.isBlocked(currentBuild: currentBuild, minIOSBuild: version.minIOSBuild) {
                state = .blocked(minBuild: version.minIOSBuild)
            } else if case .blocked = state {
                return
            } else {
                state = .ok
            }
        } catch {
            return
        }
    }

    /// APIClient が 426 を受けたときに呼ぶ。既知の minBuild があれば保持する
    func handleUpgradeRequired() {
        if case let .blocked(minBuild) = state {
            state = .blocked(minBuild: minBuild)
        } else {
            state = .blocked(minBuild: nil)
        }
    }
}
