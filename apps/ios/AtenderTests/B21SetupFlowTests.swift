import XCTest
@testable import Atender

// Reviewer 生成: build 21 設計 §5.3.3 / §5.4 / §5.6 / §8.1 / §7.C (C28-C35, C37-C40) のみを根拠。
// 実装は未読。実 APIClient + 実 Repository を StubURLProtocol で駆動し、リクエスト順を記録して検証する。

private struct Rec: Equatable {
    let method: String
    let path: String
    let body: [String: String]   // 値は文字列化 (キー集合 + 値の確認用)
    var key: String { "\(method) \(path)" }
}

@MainActor
final class B21SetupFlowTests: XCTestCase {

    private var recs: [Rec] = []
    private var toasts: [String] = []

    override func setUp() {
        super.setUp()
        recs = []
        toasts = []
    }

    override func tearDown() {
        StubURLProtocol.handler = nil
        StubURLProtocol.lastRequest = nil
        try? KeychainStore().delete()
        super.tearDown()
    }

    // MARK: harness

    private struct Env {
        let client: APIClient
        let auth: AuthStore
        let cache: QueryClient
    }

    private func makeEnv() throws -> Env {
        let keychain = KeychainStore()
        try? keychain.delete()
        try keychain.save(token: "tok")
        let auth = AuthStore(keychain: keychain, session: StubURLProtocol.makeSession())
        return Env(client: APIClient(session: StubURLProtocol.makeSession(), authStore: auth), auth: auth, cache: QueryClient())
    }

    private static func readBody(_ r: URLRequest) -> Data? {
        if let b = r.httpBody { return b }
        guard let s = r.httpBodyStream else { return nil }
        s.open()
        defer { s.close() }
        var data = Data()
        var buf = [UInt8](repeating: 0, count: 4096)
        while s.hasBytesAvailable {
            let n = s.read(&buf, maxLength: buf.count)
            if n <= 0 { break }
            data.append(buf, count: n)
        }
        return data
    }

    /// route: (method, path, call index for same key) -> (status, json)
    private func install(_ route: @escaping (String, String, Int) -> (Int, String)) {
        var counts: [String: Int] = [:]
        StubURLProtocol.handler = { [weak self] request in
            let method = request.httpMethod ?? "GET"
            let path = request.url?.path ?? ""
            var flat: [String: String] = [:]
            if let d = Self.readBody(request), let o = try? JSONSerialization.jsonObject(with: d) as? [String: Any] {
                for (k, v) in o { flat[k] = "\(v)" }
            }
            let key = "\(method) \(path)"
            let idx = counts[key, default: 0]
            counts[key] = idx + 1
            DispatchQueue.main.sync { self?.recs.append(Rec(method: method, path: path, body: flat)) }
            let (status, json) = route(method, path, idx)
            let resp = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1",
                                       headerFields: ["Content-Type": "application/json"])!
            return (resp, Data(json.utf8))
        }
    }

    private func count(_ key: String) -> Int { recs.filter { $0.key == key }.count }
    private func rec(_ key: String) -> Rec? { recs.first { $0.key == key } }
    private func keys() -> [String] { recs.map(\.key) }

    nonisolated private let errJSON = #"{"error":{"code":"X","message":"x"}}"#

    nonisolated private func meJSON(complete: Bool, schoolName: String? = nil) -> String {
        """
        {"user":{"id":"me","email":"a@b.c","name":null,"image":null,"handle":null,"inviteCode":null,
        "defaultSemesterId":"sem-new","schoolId":"s1","departmentId":"d1","requiredAttendanceRate":70},
        "setupStatus":{"hasSchool":true,"hasDepartment":true,"hasSemester":\(complete),"hasUserTimetable":\(complete),"isComplete":\(complete)}}
        """
    }

    nonisolated private func templateJSON(id: String, title: String = "2026 後期 情報科学科 2年") -> String {
        """
        {"id":"\(id)","authorUserId":"au","schoolId":"s1","departmentId":"d1","title":"\(title)","description":null,"year":2,"term":"後期",
        "isPublic":true,"copyCount":3,"daySlots":[],
        "courses":[{"id":"c1","name":"OS","teacher":null,"color":null,"note":null}],
        "meetings":[{"id":"m1","courseId":"c1","dayOfWeek":1,"startPeriodIndex":1,"periodCount":1,"room":null}],
        "createdAt":"2026-10-01T00:00:00.000Z","updatedAt":"2026-10-03T00:30:00.000Z","schoolName":"S","departmentName":"D"}
        """
    }

    nonisolated private func utJSON(id: String = "ut-new", semesterId: String = "sem-new", title: String = "2026 後期 情報科学科 2年",
                        courses: Int = 0) -> String {
        let cs = (0..<courses).map { #"{"id":"cc\#($0)","name":"科目\#($0)","teacher":null,"color":null,"note":null}"# }.joined(separator: ",")
        let ms = courses > 0 ? #"{"id":"mm","courseId":"cc0","dayOfWeek":1,"startPeriodIndex":1,"periodCount":1,"room":null}"# : ""
        return """
        {"id":"\(id)","userId":"me","semesterId":"\(semesterId)","title":"\(title)","sourceTemplateId":null,"daysOfWeek":[1,2,3,4,5],
        "daySlots":[],"courses":[\(cs)],"meetings":[\(ms)],"createdAt":"2026-10-01T00:00:00.000Z","updatedAt":"2026-10-01T00:00:00.000Z"}
        """
    }

    nonisolated private let semesterJSON = #"{"id":"sem-new","name":"2026 後期","startDate":"2026-10-01","endDate":"2027-03-31"}"#

    private func makeSetup(_ e: Env) -> SetupViewModel {
        SetupViewModel(
            schoolRepository: SchoolRepository(client: e.client, cache: e.cache),
            meRepository: MeRepository(client: e.client, cache: e.cache),
            semesterRepository: SemesterRepository(client: e.client, cache: e.cache),
            templateRepository: TemplateRepository(client: e.client, cache: e.cache),
            timetableRepository: TimetableRepository(client: e.client, cache: e.cache),
            authStore: e.auth
        )
    }

    private func pickDepartment(_ vm: SetupViewModel) {
        let school = SchoolDto(id: "s1", mextCode: nil, kind: .university, name: "テスト大学", nameKana: nil, prefecture: nil)
        vm.picker.selectSchool(school)
        vm.picker.department = DepartmentDto(id: "d1", schoolId: "s1", name: "情報科学科", nameKana: nil)
    }

    // MARK: C28

    func testC28InitialSemesterDraftComesFromToday() throws {
        let e = try makeEnv()
        let vm = makeSetup(e)
        let expected = SemesterRollover.initialProposal(today: SchoolClock.todayString())
        XCTAssertEqual(vm.semester.name, expected.name)
        XCTAssertEqual(vm.semester.startDate, expected.startDate)
        XCTAssertEqual(vm.semester.endDate, expected.endDate)
        XCTAssertEqual(vm.step, .school)
        XCTAssertFalse(vm.hasTemplateStep)
        XCTAssertNil(vm.selectedTemplateId)
        XCTAssertNil(vm.createdSemesterId)
        XCTAssertFalse(vm.copyFailed)
    }

    func testStepTitlesBeforeSuggestionsAreOutOfThree() throws {
        let vm = makeSetup(try makeEnv())
        XCTAssertTrue(vm.title.hasPrefix("Step 1/3"), vm.title)
    }

    // MARK: C29 / C30

    func testC29SuggestionsFoundGoesToTemplateStep() async throws {
        let e = try makeEnv()
        install { m, p, _ in
            if m == "PATCH", p == "/api/me" { return (200, self.meJSON(complete: false)) }
            if m == "GET", p == "/api/timetable-templates" {
                return (200, #"{"templates":[\#(self.templateJSON(id: "t1")),\#(self.templateJSON(id: "t2", title: "別"))],"nextCursor":null}"#)
            }
            return (404, self.errJSON)
        }
        let vm = makeSetup(e)
        pickDepartment(vm)
        await vm.submitDepartment()

        XCTAssertEqual(vm.step, .template)
        XCTAssertTrue(vm.hasTemplateStep)
        XCTAssertEqual(vm.suggestions.count, 2)
        XCTAssertEqual(vm.title, "Step 3/4: 時間割を選ぶ")
        XCTAssertNil(vm.errorText)
        let patch = try XCTUnwrap(rec("PATCH /api/me"))
        XCTAssertEqual(patch.body["schoolId"], "s1")
        XCTAssertEqual(patch.body["departmentId"], "d1")
    }

    func testC29SuggestionsWithOnlyEmptyTemplatesAreTreatedAsNone() async throws {
        let e = try makeEnv()
        let emptyTpl = templateJSON(id: "t1").replacingOccurrences(
            of: #""meetings":[{"id":"m1","courseId":"c1","dayOfWeek":1,"startPeriodIndex":1,"periodCount":1,"room":null}]"#, with: #""meetings":[]"#)
        install { m, p, _ in
            if m == "PATCH", p == "/api/me" { return (200, self.meJSON(complete: false)) }
            if m == "GET", p == "/api/timetable-templates" { return (200, #"{"templates":[\#(emptyTpl)],"nextCursor":null}"#) }
            return (404, self.errJSON)
        }
        let vm = makeSetup(e)
        pickDepartment(vm)
        await vm.submitDepartment()
        XCTAssertEqual(vm.step, .semester, "授業 0 件のテンプレは提案に数えない")
        XCTAssertEqual(vm.title, "Step 3/3: 学期を作る")
    }

    func testC30ZeroSuggestionsSkipsTemplateStep() async throws {
        let e = try makeEnv()
        install { m, p, _ in
            if m == "PATCH", p == "/api/me" { return (200, self.meJSON(complete: false)) }
            if m == "GET", p == "/api/timetable-templates" { return (200, #"{"templates":[],"nextCursor":null}"#) }
            return (404, self.errJSON)
        }
        let vm = makeSetup(e)
        pickDepartment(vm)
        await vm.submitDepartment()
        XCTAssertEqual(vm.step, .semester)
        XCTAssertFalse(vm.hasTemplateStep)
        XCTAssertEqual(vm.title, "Step 3/3: 学期を作る")
        XCTAssertNil(vm.errorText)
    }

    func testC30SuggestionFetchFailureIsSilentAndSkipsTemplateStep() async throws {
        let e = try makeEnv()
        install { m, p, _ in
            if m == "PATCH", p == "/api/me" { return (200, self.meJSON(complete: false)) }
            if m == "GET", p == "/api/timetable-templates" { return (500, self.errJSON) }
            return (404, self.errJSON)
        }
        let vm = makeSetup(e)
        pickDepartment(vm)
        await vm.submitDepartment()
        XCTAssertEqual(vm.step, .semester)
        XCTAssertEqual(vm.title, "Step 3/3: 学期を作る")
        XCTAssertNil(vm.errorText, "提案取得の失敗でオンボーディングを止めない・エラーも出さない")
    }

    // MARK: C31 / C32

    private func vmAtTemplateStep(_ e: Env) async -> SetupViewModel {
        install { m, p, _ in
            if m == "PATCH", p == "/api/me" { return (200, self.meJSON(complete: false)) }
            if m == "GET", p == "/api/timetable-templates" { return (200, #"{"templates":[\#(self.templateJSON(id: "t1"))],"nextCursor":null}"#) }
            return (404, self.errJSON)
        }
        let vm = makeSetup(e)
        pickDepartment(vm)
        await vm.submitDepartment()
        return vm
    }

    func testC31SemesterStepWithSuggestionsIsStepFourOfFour() async throws {
        let vm = await vmAtTemplateStep(try makeEnv())
        XCTAssertEqual(vm.step, .template)
        vm.selectedTemplateId = "t1"
        vm.step = .semester
        XCTAssertEqual(vm.step, .semester)
        XCTAssertEqual(vm.title, "Step 4/4: 学期を作る")
        XCTAssertEqual(vm.selectedTemplateId, "t1")
    }

    func testBackToDepartmentFromTemplateStep() async throws {
        let vm = await vmAtTemplateStep(try makeEnv())
        vm.backToDepartment()
        XCTAssertEqual(vm.step, .department)
    }

    // MARK: C33 / C34 / C35

    nonisolated private func routeForSubmit(copyStatus: Int) -> (String, String, Int) -> (Int, String) {
        return { m, p, _ in
            switch (m, p) {
            case ("PATCH", "/api/me"): return (200, self.meJSON(complete: false))
            case ("GET", "/api/me"): return (200, self.meJSON(complete: true))
            case ("GET", "/api/timetable-templates"): return (200, #"{"templates":[\#(self.templateJSON(id: "t1"))],"nextCursor":null}"#)
            case ("POST", "/api/semesters"): return (201, #"{"semester":\#(self.semesterJSON)}"#)
            case ("POST", "/api/timetable-templates/t1/copy"):
                return copyStatus == 201 ? (201, #"{"userTimetable":\#(self.utJSON())}"#) : (copyStatus, self.errJSON)
            default: return (404, self.errJSON)
            }
        }
    }

    func testC33CopyFailureStopsBeforeSetDefaultAndRefreshMe() async throws {
        let e = try makeEnv()
        let vm = await vmAtTemplateStep(e)
        install(routeForSubmit(copyStatus: 500))
        recs = []
        vm.selectedTemplateId = "t1"
        vm.step = .semester

        await vm.submitSemester()

        XCTAssertTrue(vm.copyFailed)
        XCTAssertNotNil(vm.createdSemesterId)
        XCTAssertEqual(count("POST /api/semesters"), 1)
        XCTAssertGreaterThanOrEqual(count("POST /api/timetable-templates/t1/copy"), 1)
        XCTAssertEqual(count("PATCH /api/me"), 0, "copy 失敗では既定学期を立てない")
        XCTAssertEqual(count("GET /api/me"), 0, "refreshMe は呼ばれない")
        XCTAssertNotEqual(e.auth.me?.setupStatus.isComplete, true, "遷移は起きない")
    }

    func testC34SkipAfterCopyFailureDoesNotRecreateSemester() async throws {
        let e = try makeEnv()
        let vm = await vmAtTemplateStep(e)
        install(routeForSubmit(copyStatus: 500))
        recs = []
        vm.selectedTemplateId = "t1"
        vm.step = .semester
        await vm.submitSemester()
        XCTAssertTrue(vm.copyFailed)

        vm.selectedTemplateId = nil   // 「取り込まずに完了」
        await vm.submitSemester()

        XCTAssertEqual(count("POST /api/semesters"), 1, "学期作成を再送しない")
        XCTAssertEqual(count("PATCH /api/me"), 1)
        XCTAssertEqual(rec("PATCH /api/me")?.body["defaultSemesterId"], "sem-new")
        XCTAssertEqual(count("GET /api/me"), 1, "最後に refreshMe")
        XCTAssertEqual(e.auth.me?.setupStatus.isComplete, true)
        let order = keys().filter { ["POST /api/semesters", "PATCH /api/me", "GET /api/me"].contains($0) }
        XCTAssertEqual(order, ["POST /api/semesters", "PATCH /api/me", "GET /api/me"])
    }

    func testC34RetryAfterCopyFailureReusesCreatedSemesterAndCopies() async throws {
        let e = try makeEnv()
        let vm = await vmAtTemplateStep(e)
        install(routeForSubmit(copyStatus: 500))
        recs = []
        vm.selectedTemplateId = "t1"
        vm.step = .semester
        await vm.submitSemester()
        XCTAssertTrue(vm.copyFailed)

        install(routeForSubmit(copyStatus: 201))   // 今度は通る
        await vm.submitSemester()                  // 「もう一度」

        XCTAssertEqual(count("POST /api/semesters"), 1)
        XCTAssertFalse(vm.copyFailed)
        XCTAssertEqual(count("PATCH /api/me"), 1)
        XCTAssertEqual(count("GET /api/me"), 1)
        XCTAssertEqual(e.auth.me?.setupStatus.isComplete, true)
    }

    func testC35Copy409IsTreatedAsSuccess() async throws {
        let e = try makeEnv()
        let vm = await vmAtTemplateStep(e)
        install(routeForSubmit(copyStatus: 409))
        recs = []
        vm.selectedTemplateId = "t1"
        vm.step = .semester

        await vm.submitSemester()

        XCTAssertFalse(vm.copyFailed)
        XCTAssertTrue(vm.templateCopied)
        XCTAssertEqual(count("PATCH /api/me"), 1)
        XCTAssertEqual(count("GET /api/me"), 1)
        XCTAssertEqual(e.auth.me?.setupStatus.isComplete, true)
    }

    func testOrderOnHappyPathCreateCopySetDefaultRefresh() async throws {
        let e = try makeEnv()
        let vm = await vmAtTemplateStep(e)
        install(routeForSubmit(copyStatus: 201))
        recs = []
        vm.selectedTemplateId = "t1"
        vm.step = .semester
        await vm.submitSemester()
        let copyBody = try XCTUnwrap(rec("POST /api/timetable-templates/t1/copy")).body
        XCTAssertEqual(copyBody["semesterId"], "sem-new")
        XCTAssertNil(copyBody["replaceExisting"], "オンボーディングの取り込みは置換しない")
        XCTAssertEqual(keys().filter { !$0.hasPrefix("GET /api/timetable-templates") },
                       ["POST /api/semesters", "POST /api/timetable-templates/t1/copy", "PATCH /api/me", "GET /api/me"])
    }

    func testNoTemplateSelectedSkipsCopy() async throws {
        let e = try makeEnv()
        let vm = await vmAtTemplateStep(e)
        install(routeForSubmit(copyStatus: 201))
        recs = []
        vm.selectedTemplateId = nil
        vm.step = .semester
        await vm.submitSemester()
        XCTAssertEqual(keys(), ["POST /api/semesters", "PATCH /api/me", "GET /api/me"])
    }

    // MARK: TemplateImportViewModel (C37-C40)

    private func makeImport(_ e: Env, initial: String? = "sem-new", def: String? = nil) -> TemplateImportViewModel {
        TemplateImportViewModel(
            templateRepository: TemplateRepository(client: e.client, cache: e.cache),
            semesterRepository: SemesterRepository(client: e.client, cache: e.cache),
            timetableRepository: TimetableRepository(client: e.client, cache: e.cache),
            initialSemesterId: initial, defaultSemesterId: def,
            toast: { [weak self] in self?.toasts.append($0) }
        )
    }

    nonisolated private var semestersJSON: String { #"{"semesters":[\#(semesterJSON),{"id":"sem-b","name":"2027 前期","startDate":"2027-04-01","endDate":"2027-09-30"}]}"# }

    nonisolated private func importRoute(timetables: @escaping (Int) -> String, copy: @escaping (Int) -> (Int, String))
        -> (String, String, Int) -> (Int, String) {
        return { m, p, i in
            switch (m, p) {
            case ("GET", "/api/semesters"): return (200, self.semestersJSON)
            case ("GET", "/api/user-timetables"): return (200, #"{"userTimetables":[\#(timetables(i))]}"#)
            case ("POST", "/api/timetable-templates/t1/copy"): return copy(i)
            default: return (404, self.errJSON)
            }
        }
    }

    private var tpl: TemplateDto { B21Fx.template(id: "t1", title: "公開時間割A") }

    func testTargetSemesterDefaults() async throws {
        let e = try makeEnv()
        install(importRoute(timetables: { _ in "" }, copy: { _ in (201, "") }))
        XCTAssertEqual(makeImport(e, initial: "x", def: "y").targetSemesterId, "x")
        XCTAssertEqual(makeImport(e, initial: nil, def: "y").targetSemesterId, "y")
        let vm = makeImport(e, initial: nil, def: nil)
        await vm.load()
        XCTAssertEqual(vm.targetSemesterId, "sem-new", "どちらも無ければ先頭の学期")
    }

    func testC37ExistingTimetableWithContentAsksForConfirmationAndSendsNothing() async throws {
        let e = try makeEnv()
        install(importRoute(timetables: { _ in self.utJSON(id: "ut-old", courses: 2) }, copy: { _ in (201, #"{"userTimetable":\#(self.utJSON())}"#) }))
        let vm = makeImport(e)
        await vm.load()
        let result = await vm.requestImport(tpl)

        XCTAssertNil(result)
        let pending = try XCTUnwrap(vm.pendingReplace)
        XCTAssertEqual(pending.courseCount, 2)
        XCTAssertEqual(pending.semesterName, "2026 後期")
        XCTAssertEqual(pending.template.id, "t1")
        XCTAssertEqual(count("POST /api/timetable-templates/t1/copy"), 0, "確認前は何も送らない")

        // キャンセル相当
        vm.pendingReplace = nil
        XCTAssertEqual(count("POST /api/timetable-templates/t1/copy"), 0)
    }

    func testC37ConfirmReplaceSendsReplaceExistingAndToasts() async throws {
        let e = try makeEnv()
        install(importRoute(timetables: { _ in self.utJSON(id: "ut-old", courses: 2) }, copy: { _ in (201, #"{"userTimetable":\#(self.utJSON(title: "公開時間割A"))}"#) }))
        let vm = makeImport(e)
        await vm.load()
        _ = await vm.requestImport(tpl)
        let dto = await vm.confirmReplace()

        XCTAssertNotNil(dto)
        let copy = try XCTUnwrap(rec("POST /api/timetable-templates/t1/copy"))
        XCTAssertEqual(copy.body["replaceExisting"], "1")
        XCTAssertEqual(copy.body["semesterId"], "sem-new")
        XCTAssertNil(copy.body["title"])
        XCTAssertNil(vm.pendingReplace)
        XCTAssertEqual(toasts, ["「公開時間割A」を取り込みました"])
    }

    func testC38EmptyTimetableIsReplacedSilentlyWithOneCopyRequest() async throws {
        let e = try makeEnv()
        install(importRoute(timetables: { _ in self.utJSON(id: "ut-empty", courses: 0) }, copy: { _ in (201, #"{"userTimetable":\#(self.utJSON(title: "公開時間割A"))}"#) }))
        let vm = makeImport(e)
        await vm.load()
        let dto = await vm.requestImport(tpl)

        XCTAssertNotNil(dto)
        XCTAssertNil(vm.pendingReplace)
        XCTAssertEqual(count("POST /api/timetable-templates/t1/copy"), 1)
        XCTAssertEqual(rec("POST /api/timetable-templates/t1/copy")?.body["replaceExisting"], "1")
    }

    func testC39NoExistingTimetablePlainCopyAndToast() async throws {
        let e = try makeEnv()
        install(importRoute(timetables: { _ in "" }, copy: { _ in (201, #"{"userTimetable":\#(self.utJSON(title: "公開時間割A"))}"#) }))
        let vm = makeImport(e)
        await vm.load()
        let dto = await vm.requestImport(tpl)

        XCTAssertEqual(dto?.id, "ut-new")
        let copy = try XCTUnwrap(rec("POST /api/timetable-templates/t1/copy"))
        XCTAssertNil(copy.body["replaceExisting"])
        XCTAssertEqual(toasts, ["「公開時間割A」を取り込みました"])
    }

    func testC40Copy404ToastsGoneMessage() async throws {
        let e = try makeEnv()
        install(importRoute(timetables: { _ in "" }, copy: { _ in (404, self.errJSON) }))
        let vm = makeImport(e)
        await vm.load()
        let dto = await vm.requestImport(tpl)
        XCTAssertNil(dto)
        XCTAssertEqual(toasts, ["この時間割は公開が終了しました"])
        XCTAssertNil(vm.pendingReplace)
    }

    func testOtherErrorToastsRetryMessageAndKeepsState() async throws {
        let e = try makeEnv()
        install(importRoute(timetables: { _ in "" }, copy: { _ in (500, self.errJSON) }))
        let vm = makeImport(e)
        await vm.load()
        let dto = await vm.requestImport(tpl)
        XCTAssertNil(dto)
        XCTAssertEqual(toasts, ["取り込めませんでした、もう一度試してください"])
        XCTAssertNil(vm.pendingReplace)
        XCTAssertFalse(vm.isImporting)
    }

    func testConflict409RefetchesAndAsksConfirmationWhenContentAppeared() async throws {
        let e = try makeEnv()
        install(importRoute(
            timetables: { i in i == 0 ? "" : self.utJSON(id: "ut-race", courses: 3) },
            copy: { _ in (409, self.errJSON) }))
        let vm = makeImport(e)
        await vm.load()
        let dto = await vm.requestImport(tpl)

        XCTAssertNil(dto)
        XCTAssertEqual(vm.pendingReplace?.courseCount, 3)
        XCTAssertEqual(count("POST /api/timetable-templates/t1/copy"), 1, "確認が出るまで置換は送らない")
        XCTAssertEqual(count("GET /api/user-timetables"), 2, "409 で再取得する")
    }

    func testConflict409RefetchesAndReplacesSilentlyWhenNowEmpty() async throws {
        let e = try makeEnv()
        install(importRoute(
            timetables: { i in i == 0 ? "" : self.utJSON(id: "ut-race", courses: 0) },
            copy: { i in i == 0 ? (409, self.errJSON) : (201, #"{"userTimetable":\#(self.utJSON(title: "公開時間割A"))}"#) }))
        let vm = makeImport(e)
        await vm.load()
        let dto = await vm.requestImport(tpl)

        XCTAssertNotNil(dto)
        let copies = recs.filter { $0.key == "POST /api/timetable-templates/t1/copy" }
        XCTAssertEqual(copies.count, 2)
        XCTAssertNil(copies[0].body["replaceExisting"])
        XCTAssertEqual(copies[1].body["replaceExisting"], "1")
    }

    func testConflict409RetriesAtMostOnce() async throws {
        let e = try makeEnv()
        // 再取得しても「無い」と言い続けるが copy は 409 のまま → 無限ループしない
        install(importRoute(timetables: { _ in "" }, copy: { _ in (409, self.errJSON) }))
        let vm = makeImport(e)
        await vm.load()
        let dto = await vm.requestImport(tpl)
        XCTAssertNil(dto)
        XCTAssertLessThanOrEqual(count("POST /api/timetable-templates/t1/copy"), 2)
    }

    // MARK: repository wiring: unpublish / publish

    func testUnpublishTemplateSendsPatchIsPublicFalse() async throws {
        let e = try makeEnv()
        install { m, p, _ in
            if m == "PATCH", p == "/api/timetable-templates/tpl9" { return (200, #"{"template":\#(self.templateJSON(id: "tpl9"))}"#) }
            return (404, self.errJSON)
        }
        let repo = TimetableRepository(client: e.client, cache: e.cache)
        try await repo.unpublishTemplate(id: "tpl9")
        let r = try XCTUnwrap(rec("PATCH /api/timetable-templates/tpl9"))
        XCTAssertEqual(r.body["isPublic"], "0")
        XCTAssertEqual(r.body.count, 1)
    }

    func testPublishAsTemplateAcceptsBoth200And201() async throws {
        let e = try makeEnv()
        for status in [200, 201] {
            install { m, p, _ in
                if m == "POST", p == "/api/user-timetables/ut1/publish-as-template" { return (status, #"{"template":\#(self.templateJSON(id: "tpl9"))}"#) }
                return (404, self.errJSON)
            }
            let repo = TimetableRepository(client: e.client, cache: e.cache)
            let t = try await repo.publishAsTemplate(id: "ut1", title: "公開")
            XCTAssertEqual(t.id, "tpl9", "status \(status)")
        }
    }

    func testPublishAsTemplateInvalidatesUserTimetablesCache() async throws {
        let e = try makeEnv()
        // 一覧が 1 回目は未公開、公開後の 2 回目は publishedTemplate 付きで返ることを repository 越しに確認する
        var listCalls = 0
        install { m, p, _ in
            if m == "GET", p == "/api/user-timetables" {
                listCalls += 1
                let pub = listCalls == 1 ? "" : #","publishedTemplate":{"id":"tpl9","title":"公開","isPublic":true,"updatedAt":"2026-10-03T00:30:00.000Z"}"#
                return (200, #"{"userTimetables":[\#(self.utJSON(id: "ut1").dropLast())\#(pub)}]}"#)
            }
            if m == "POST", p == "/api/user-timetables/ut1/publish-as-template" { return (201, #"{"template":\#(self.templateJSON(id: "tpl9"))}"#) }
            return (404, self.errJSON)
        }
        let repo = TimetableRepository(client: e.client, cache: e.cache)
        let before = try await repo.userTimetables()
        XCTAssertNil(before.first?.publishedTemplate)
        _ = try await repo.publishAsTemplate(id: "ut1", title: "公開")
        let after = try await repo.userTimetables()   // force 無し: キャッシュが無効化されていれば再取得される
        XCTAssertEqual(after.first?.publishedTemplate?.id, "tpl9")
    }
}
