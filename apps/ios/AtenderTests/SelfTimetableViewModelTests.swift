import XCTest
@testable import Atender

// Reviewer 生成: 設計 §T-9 (SelfTimetableView VM ロジック) + §SelfTimetableView (toEventInput/emptyTimetable/display) を根拠に検証。
// ネットワークを要さない純粋メソッド (selected/emptyTimetable/display/eventInputs/ensureTimetable の selected 分岐) のみ対象。
@MainActor
final class SelfTimetableViewModelTests: XCTestCase {

    private func makeVM() -> SelfTimetableViewModel {
        SelfTimetableViewModel(environment: AppEnvironment())
    }

    private func tt(id: String, semesterId: String,
                    courses: [CourseDto] = [], meetings: [MeetingDto] = []) -> UserTimetableDto {
        UserTimetableDto(id: id, userId: "u", semesterId: semesterId, title: "T",
                         sourceTemplateId: nil, daysOfWeek: [1, 2, 3, 4, 5],
                         daySlots: [], courses: courses, meetings: meetings,
                         createdAt: "", updatedAt: "")
    }

    func testSelectedMatchesSemesterId() {
        let vm = makeVM()
        vm.timetables = [tt(id: "a", semesterId: "s1"), tt(id: "b", semesterId: "s2")]
        XCTAssertEqual(vm.selected(semesterId: "s2")?.id, "b")
        XCTAssertNil(vm.selected(semesterId: "s3"))
    }

    func testEmptyTimetableUsesExplicitSemesterFallback() {
        let vm = makeVM()
        // selected 無し + explicit semesterId → 空テンプレ生成
        let empty = vm.emptyTimetable(semesterId: "sem_x")
        XCTAssertNotNil(empty)
        XCTAssertEqual(empty?.id, "")                        // §402 id:""
        XCTAssertEqual(empty?.title, "自分の時間割")
        XCTAssertEqual(empty?.daysOfWeek, [1, 2, 3, 4, 5])
        XCTAssertEqual(empty?.daySlots, vm.defaultSlots)     // defaultSlots
        XCTAssertEqual(empty?.courses.count, 0)
        XCTAssertEqual(empty?.meetings.count, 0)
    }

    func testEmptyTimetableNilWhenNoFallbackAvailable() {
        let vm = makeVM()
        // semesterId nil, me nil, semesters 空 → fallback 解決不能 → nil
        XCTAssertNil(vm.emptyTimetable(semesterId: nil))
    }

    func testDisplayPrefersSelectedThenCreatedThenEmpty() {
        let vm = makeVM()
        vm.timetables = [tt(id: "sel", semesterId: "s1")]
        XCTAssertEqual(vm.display(semesterId: "s1")?.id, "sel")           // selected
        // selected 無い学期 → empty テンプレ (id "")
        XCTAssertEqual(vm.display(semesterId: "s9")?.id, "")
    }

    func testEventInputsMapsMeeting() {
        let vm = makeVM()
        let course = CourseDto(id: "c1", name: "情報デザイン", teacher: nil, color: "#123456", note: nil)
        let meeting = MeetingDto(id: "m1", courseId: "c1", dayOfWeek: 0, startPeriodIndex: 2, periodCount: 1, room: "A-201")
        let timetable = tt(id: "t", semesterId: "s1", courses: [course], meetings: [meeting])

        let inputs = vm.eventInputs(for: timetable)
        XCTAssertEqual(inputs.count, 1)
        let e = inputs[0]
        XCTAssertEqual(e.id, "m1")
        XCTAssertEqual(e.dayOfWeek, DayConvention.jsToDisplay(0)) // JS 0(日) → display 7
        XCTAssertEqual(e.startPeriodIndex, 2)
        XCTAssertEqual(e.color, "#123456")
        XCTAssertEqual(e.title, "情報デザイン")
        XCTAssertEqual(e.subtitle, "A-201")
        XCTAssertEqual(e.mergeKey, "c1")
    }

    func testEventInputsColorFallbackWhenCourseMissing() {
        let vm = makeVM()
        // course.color nil → "#F97316" (§423)
        let course = CourseDto(id: "c1", name: "授業", teacher: nil, color: nil, note: nil)
        let meeting = MeetingDto(id: "m1", courseId: "c1", dayOfWeek: 1, startPeriodIndex: 1, periodCount: 1, room: nil)
        let inputs = vm.eventInputs(for: tt(id: "t", semesterId: "s1", courses: [course], meetings: [meeting]))
        XCTAssertEqual(inputs.first?.color, "#F97316")
    }

    func testEnsureTimetableReturnsSelectedWithoutNetwork() async {
        let vm = makeVM()
        vm.timetables = [tt(id: "sel", semesterId: "s1")]
        let result = await vm.ensureTimetable(semesterId: "s1")
        XCTAssertEqual(result?.id, "sel")
    }
}
