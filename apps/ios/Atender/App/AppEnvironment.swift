import Foundation
import Observation

@MainActor
@Observable
final class AppEnvironment {
    let authStore: AuthStore
    let apiClient: APIClient
    let queryClient: QueryClient
    let toastCenter: ToastCenter
    let appRouter: AppRouter

    init() {
        #if DEBUG
        if let t = ProcessInfo.processInfo.environment["ATENDER_DEBUG_BEARER_TOKEN"], !t.isEmpty {
            try? KeychainStore().save(token: t)
            NSLog("[ATENDER_DEBUG] token injected from env len=%d", t.count)
        }
        #endif
        let authStore = AuthStore()
        let queryClient = QueryClient()
        self.authStore = authStore
        self.queryClient = queryClient
        self.toastCenter = ToastCenter()
        self.appRouter = AppRouter()
        self.apiClient = APIClient(authStore: authStore)
        authStore.onLocalSignOut = { [queryClient] in
            queryClient.removeAll()
        }
    }
}
