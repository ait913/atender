import XCTest
@testable import Atender

// Reviewer 生成: 設計 §T-3 (MeetingExpansion.expandUserTimetable / eventsByDate) + §MemberColor を根拠に検証。
// 期待日付: 2026-06-22 は月曜 (§T-4 mondayOf(2026-06-24)=2026-06-22)。
final class MeetingExpansionTests: XCTestCase {

    private let monday = "2026-06-22"

    private func slots() -> [DaySlotDto] {
        [
            DaySlotDto(periodIndex: 1, label: "1限", startMinute: 540, endMinute: 630, isBreak: false),
            DaySlotDto(periodIndex: 2, label: "2限", startMinute: 640, endMinute: 730, isBreak: false),
        ]
    }
    private func course(id: String, color: String?) -> CourseDto {
        CourseDto(id: id, name: "情報", teacher: nil, color: color, note: nil)
    }
    private func meeting(course: String, dow: Int, start: Int, count: Int) -> MeetingDto {
        MeetingDto(id: "meet", courseId: course, dayOfWeek: dow, startPeriodIndex: start, periodCount: count, room: nil)
    }

    func testExpandsMondayMeetingWithStartEndMinutes() {
        let events = MeetingExpansion.expandUserTimetable(
            meetings: [meeting(course: "c1", dow: 1, start: 1, count: 2)],
            courses: [course(id: "c1", color: "#123456")],
            daySlots: slots(),
            rangeStart: monday, rangeEnd: monday,
            semesterStart: nil, semesterEnd: nil,
            statusByDate: [:]
        )
        XCTAssertEqual(events.count, 1)
        let e = events[0]
        XCTAssertEqual(e.kind, .meeting)
        XCTAssertEqual(e.date, monday)
        XCTAssertEqual(e.startMinute, 540)   // slot1.start
        XCTAssertEqual(e.endMinute, 730)     // slot(start+count-1=2).end
        XCTAssertEqual(e.color, "#123456")   // course.color
        XCTAssertEqual(e.courseId, "c1")
        // id keying = "m:courseId:date:startMinute" (§251)
        XCTAssertEqual(e.id, "m:c1:\(monday):540")
    }

    func testColorFallbackToMemberColorWhenCourseColorNil() {
        let events = MeetingExpansion.expandUserTimetable(
            meetings: [meeting(course: "c9", dow: 1, start: 1, count: 1)],
            courses: [course(id: "c9", color: nil)],
            daySlots: slots(),
            rangeStart: monday, rangeEnd: monday,
            semesterStart: nil, semesterEnd: nil,
            statusByDate: [:]
        )
        XCTAssertEqual(events.count, 1)
        XCTAssertEqual(events[0].color, MemberColor.memberColor("c9"))
    }

    func testNoClassDayIsSkipped() {
        let events = MeetingExpansion.expandUserTimetable(
            meetings: [meeting(course: "c1", dow: 1, start: 1, count: 1)],
            courses: [course(id: "c1", color: "#111111")],
            daySlots: slots(),
            rangeStart: monday, rangeEnd: monday,
            semesterStart: nil, semesterEnd: nil,
            statusByDate: [monday: .noClass]
        )
        XCTAssertTrue(events.isEmpty)
    }

    func testAllSuspendedDayIsExpanded() {
        let events = MeetingExpansion.expandUserTimetable(
            meetings: [meeting(course: "c1", dow: 1, start: 1, count: 1)],
            courses: [course(id: "c1", color: "#111111")],
            daySlots: slots(),
            rangeStart: monday, rangeEnd: monday,
            semesterStart: nil, semesterEnd: nil,
            statusByDate: [monday: .allSuspended]
        )
        XCTAssertEqual(events.count, 1)
    }

    func testOutsideSemesterRangeExcluded() {
        // semesterStart が対象日より後 → 除外 (文字列比較)
        let events = MeetingExpansion.expandUserTimetable(
            meetings: [meeting(course: "c1", dow: 1, start: 1, count: 1)],
            courses: [course(id: "c1", color: "#111111")],
            daySlots: slots(),
            rangeStart: monday, rangeEnd: monday,
            semesterStart: "2026-06-23", semesterEnd: nil,
            statusByDate: [:]
        )
        XCTAssertTrue(events.isEmpty)
    }

    func testMissingDaySlotSkipsMeeting() {
        let events = MeetingExpansion.expandUserTimetable(
            meetings: [meeting(course: "c1", dow: 1, start: 9, count: 1)], // slot 9 不在
            courses: [course(id: "c1", color: "#111111")],
            daySlots: slots(),
            rangeStart: monday, rangeEnd: monday,
            semesterStart: nil, semesterEnd: nil,
            statusByDate: [:]
        )
        XCTAssertTrue(events.isEmpty)
    }

    func testMultiDayOutputSortedByDateThenStart() {
        // 月(2026-06-22) と 火(2026-06-23) にコマ → date asc
        let events = MeetingExpansion.expandUserTimetable(
            meetings: [
                meeting(course: "c1", dow: 2, start: 1, count: 1), // 火
                meeting(course: "c1", dow: 1, start: 1, count: 1), // 月
            ],
            courses: [course(id: "c1", color: "#111111")],
            daySlots: slots(),
            rangeStart: monday, rangeEnd: "2026-06-23",
            semesterStart: nil, semesterEnd: nil,
            statusByDate: [:]
        )
        XCTAssertEqual(events.map(\.date), ["2026-06-22", "2026-06-23"])
    }

    func testEventsByDateGroups() {
        let events = MeetingExpansion.expandUserTimetable(
            meetings: [
                meeting(course: "c1", dow: 1, start: 1, count: 1),
                meeting(course: "c1", dow: 2, start: 1, count: 1),
            ],
            courses: [course(id: "c1", color: "#111111")],
            daySlots: slots(),
            rangeStart: monday, rangeEnd: "2026-06-23",
            semesterStart: nil, semesterEnd: nil,
            statusByDate: [:]
        )
        let map = MeetingExpansion.eventsByDate(events)
        XCTAssertEqual(map["2026-06-22"]?.count, 1)
        XCTAssertEqual(map["2026-06-23"]?.count, 1)
        XCTAssertNil(map["2026-06-24"])
    }
}

// §MemberColor: hash パレット選択。設計はパレットからの決定的選択のみ規定 → 決定性 + パレット所属を検証。
final class MemberColorTests: XCTestCase {
    private let palette = ["#12B172", "#56D8C3", "#568CFC", "#A978FA", "#FC6ABF", "#FD728E"]

    func testDeterministic() {
        XCTAssertEqual(MemberColor.memberColor("course-abc"), MemberColor.memberColor("course-abc"))
    }
    func testOutputWithinPalette() {
        for seed in ["a", "b", "course-1", "xyz", "情報デザイン"] {
            XCTAssertTrue(palette.contains(MemberColor.memberColor(seed)), "seed=\(seed) → \(MemberColor.memberColor(seed))")
        }
    }
}
