import Foundation
import Observation

@MainActor
@Observable
final class AppEnvironment {
    let authStore: AuthStore
    let apiClient: APIClient

    init() {
        #if DEBUG
        if let t = ProcessInfo.processInfo.environment["ATENDER_DEBUG_BEARER_TOKEN"], !t.isEmpty {
            try? KeychainStore().save(token: t)
            NSLog("[ATENDER_DEBUG] token injected from env len=%d", t.count)
        }
        #endif
        let authStore = AuthStore()
        self.authStore = authStore
        self.apiClient = APIClient(authStore: authStore)
    }
}
