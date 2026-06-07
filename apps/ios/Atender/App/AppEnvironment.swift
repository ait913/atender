import Observation

@MainActor
@Observable
final class AppEnvironment {
    let authStore: AuthStore
    let apiClient: APIClient

    init() {
        let authStore = AuthStore()
        self.authStore = authStore
        self.apiClient = APIClient(authStore: authStore)
    }
}
