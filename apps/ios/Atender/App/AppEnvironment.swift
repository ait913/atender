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
    let meRepository: MeRepository
    let semesterRepository: SemesterRepository
    let timetableRepository: TimetableRepository
    let attendanceRepository: AttendanceRepository
    let personalEventRepository: PersonalEventRepository
    let dayRepository: DayRepository
    let courseRepository: CourseRepository

    init() {
        #if DEBUG
        if let t = ProcessInfo.processInfo.environment["ATENDER_UI_TEST_BEARER_TOKEN"], !t.isEmpty {
            try? KeychainStore().save(token: t)
        }
        #endif
        let authStore = AuthStore()
        let queryClient = QueryClient()
        self.authStore = authStore
        self.queryClient = queryClient
        self.toastCenter = ToastCenter()
        self.appRouter = AppRouter()
        self.apiClient = APIClient(authStore: authStore)
        self.meRepository = MeRepository(client: self.apiClient, cache: queryClient)
        self.semesterRepository = SemesterRepository(client: self.apiClient, cache: queryClient)
        self.timetableRepository = TimetableRepository(client: self.apiClient, cache: queryClient)
        self.attendanceRepository = AttendanceRepository(client: self.apiClient, cache: queryClient, toast: self.toastCenter)
        self.personalEventRepository = PersonalEventRepository(client: self.apiClient, cache: queryClient)
        self.dayRepository = DayRepository(client: self.apiClient, cache: queryClient)
        self.courseRepository = CourseRepository(client: self.apiClient, cache: queryClient)
        authStore.onLocalSignOut = { [queryClient] in
            queryClient.removeAll()
        }
    }
}
