import XCTest
@testable import Atender

// Reviewer 生成: build 19 設計 §8.1 (#C1-#C12) のみを根拠 (実装は未読)。
@MainActor
final class B19TimetableCarryOverTests: XCTestCase {

    private let semA = SemesterDto(id: "A", name: "A", startDate: "2026-04-01", endDate: "2026-09-30")
    private let semB = SemesterDto(id: "B", name: "B", startDate: "2026-10-01", endDate: "2027-03-31")
    private let semC = SemesterDto(id: "C", name: "C", startDate: "2027-04-01", endDate: "2027-09-30")

    private func makeVM() -> SelfTimetableViewModel {
        SelfTimetableViewModel(environment: AppEnvironment())
    }

    private func eightSlots() -> [DaySlotDto] {
        let starts = [540, 640, 780, 880, 980, 1080, 1180, 1280]
        return starts.enumerated().map { i, s in
            DaySlotDto(periodIndex: i + 1, label: "\(i + 1)限", startMinute: s, endMinute: s + 90, isBreak: false)
        }
    }

    private func tt(id: String, semesterId: String, days: [Int] = [1, 2, 3, 4, 5, 6], slots: [DaySlotDto]? = nil) -> UserTimetableDto {
        UserTimetableDto(id: id, userId: "u", semesterId: semesterId, title: "T", sourceTemplateId: nil,
                         daysOfWeek: days, daySlots: slots ?? eightSlots(), courses: [], meetings: [],
                         createdAt: "", updatedAt: "")
    }

    func testC1SkipsSemesterWithoutTimetable() {
        let ttA = tt(id: "ttA", semesterId: "A")
        XCTAssertEqual(TimetableCarryOver.previousTimetable(target: semC, semesters: [semA, semB, semC], timetables: [ttA]), ttA)
    }

    func testC2() {
        let ttA = tt(id: "ttA", semesterId: "A")
        XCTAssertEqual(TimetableCarryOver.previousTimetable(target: semB, semesters: [semA, semB, semC], timetables: [ttA]), ttA)
    }

    func testC3NoEarlierSemester() {
        let ttA = tt(id: "ttA", semesterId: "A")
        XCTAssertNil(TimetableCarryOver.previousTimetable(target: semA, semesters: [semA, semB, semC], timetables: [ttA]))
    }

    func testC4LatestStartDateWinsAndEmptyIsNil() {
        let ttA = tt(id: "ttA", semesterId: "A")
        let ttB = tt(id: "ttB", semesterId: "B")
        XCTAssertEqual(TimetableCarryOver.previousTimetable(target: semC, semesters: [semA, semB, semC], timetables: [ttA, ttB]), ttB)
        XCTAssertNil(TimetableCarryOver.previousTimetable(target: semC, semesters: [semA, semB, semC], timetables: []))
    }

    func testC5TieBreaks() {
        let a2 = SemesterDto(id: "A2", name: "A2", startDate: "2026-04-01", endDate: "2026-10-15")
        let ttA = tt(id: "ttA", semesterId: "A")
        let ttA2 = tt(id: "ttA2", semesterId: "A2")
        XCTAssertEqual(TimetableCarryOver.previousTimetable(target: semB, semesters: [semA, a2, semB], timetables: [ttA, ttA2]), ttA2)
        // endDate も同じ → id 昇順で "A"
        let a3 = SemesterDto(id: "A3", name: "A3", startDate: "2026-04-01", endDate: "2026-09-30")
        let ttA3 = tt(id: "ttA3", semesterId: "A3")
        XCTAssertEqual(TimetableCarryOver.previousTimetable(target: semB, semesters: [a3, semA, semB], timetables: [ttA3, ttA]), ttA)
    }

    func testC5bSameStartDateIsNotCandidate() {
        let a2 = SemesterDto(id: "A2", name: "A2", startDate: "2026-04-01", endDate: "2026-09-30")
        XCTAssertNil(TimetableCarryOver.previousTimetable(target: semA, semesters: [semA, a2], timetables: [tt(id: "x", semesterId: "A2")]))
    }

    func testC6UnknownTargetFallsBackToDefault() {
        let vm = makeVM()
        vm.semesters = [semA, semB]
        vm.timetables = [tt(id: "ttA", semesterId: "A")]
        let e = vm.emptyTimetable(semesterId: "C")
        XCTAssertEqual(e?.daySlots, vm.defaultSlots)
        XCTAssertEqual(e?.daysOfWeek, [1, 2, 3, 4, 5])
    }

    func testC7InheritedSlots() {
        let vm = makeVM()
        let ttA = tt(id: "ttA", semesterId: "A")
        XCTAssertEqual(TimetableCarryOver.inheritedSlots(from: ttA, fallback: vm.defaultSlots), ttA.daySlots)
        XCTAssertEqual(TimetableCarryOver.inheritedSlots(from: ttA, fallback: vm.defaultSlots).count, 8)
        XCTAssertEqual(TimetableCarryOver.inheritedSlots(from: nil, fallback: vm.defaultSlots), vm.defaultSlots)
        XCTAssertEqual(TimetableCarryOver.inheritedSlots(from: tt(id: "e", semesterId: "A", slots: []), fallback: vm.defaultSlots), vm.defaultSlots)
    }

    func testC8InheritedDaysOfWeek() {
        XCTAssertEqual(TimetableCarryOver.inheritedDaysOfWeek(from: tt(id: "a", semesterId: "A")), [1, 2, 3, 4, 5, 6])
        XCTAssertEqual(TimetableCarryOver.inheritedDaysOfWeek(from: nil), [1, 2, 3, 4, 5])
        XCTAssertEqual(TimetableCarryOver.inheritedDaysOfWeek(from: tt(id: "a", semesterId: "A", days: [])), [1, 2, 3, 4, 5])
        XCTAssertEqual(TimetableCarryOver.defaultDaysOfWeek, [1, 2, 3, 4, 5])
    }

    func testC9VMEmptyTimetableInherits() {
        let vm = makeVM()
        vm.semesters = [semA, semB, semC]
        vm.timetables = [tt(id: "ttA", semesterId: "A")]
        let e = vm.emptyTimetable(semesterId: "C")
        XCTAssertEqual(e?.daySlots.count, 8)
        XCTAssertEqual(e?.daysOfWeek, [1, 2, 3, 4, 5, 6])
        XCTAssertEqual(e?.id, "")
        XCTAssertEqual(e?.title, "自分の時間割")
        XCTAssertEqual(e?.courses.count, 0)
        XCTAssertEqual(e?.meetings.count, 0)
        XCTAssertEqual(vm.display(semesterId: "C")?.daySlots.count, 8)
    }

    func testC10CreatedTimetableNotLeakedToOtherSemester() async {
        let vm = makeVM()
        vm.semesters = [semA, semB, semC]
        vm.timetables = [tt(id: "ttA", semesterId: "A")]
        vm.createdTimetable = tt(id: "created", semesterId: "B")
        XCTAssertEqual(vm.display(semesterId: "C")?.id, "")
        XCTAssertEqual(vm.display(semesterId: "B")?.id, "created")
        let ensured = await vm.ensureTimetable(semesterId: "B")
        XCTAssertEqual(ensured?.id, "created")
    }

    func testC11CreateInputEncodesDaysOfWeek() throws {
        let slot = TemplateCreateInput.DaySlotCreateInput(periodIndex: 1, label: "1限", startMinute: 540, endMinute: 630)
        let with = UserTimetableCreateInput(semesterId: "s", title: "t", daySlots: [slot], courses: [], meetings: [],
                                            daysOfWeek: [1, 2, 3, 4, 5, 6])
        let obj = try JSONSerialization.jsonObject(with: JSONEncoder().encode(with)) as? [String: Any]
        XCTAssertEqual(obj?["daysOfWeek"] as? [Int], [1, 2, 3, 4, 5, 6])
        let without = UserTimetableCreateInput(semesterId: "s", title: "t", daySlots: [slot], courses: [], meetings: [])
        let obj2 = try JSONSerialization.jsonObject(with: JSONEncoder().encode(without)) as? [String: Any]
        XCTAssertNotNil(obj2)
        XCTAssertFalse(obj2!.keys.contains("daysOfWeek"))
    }
}
