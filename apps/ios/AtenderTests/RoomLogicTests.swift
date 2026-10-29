import XCTest
@testable import Atender

final class RoomLogicTests: XCTestCase {

    private func member(_ id: String, name: String? = nil, handle: String? = nil, color: String = "#22c55e") -> RoomWeekDto.Member {
        RoomWeekDto.Member(userId: id, name: name, handle: handle, image: nil, color: color)
    }

    private func meeting(
        userId: String = "u1",
        occurrenceId: String = "occ_1",
        courseId: String = "c1",
        courseName: String = "Course",
        courseColor: String? = "#123456",
        date: String = "2026-07-01",
        startMinute: Double = 540,
        endMinute: Double = 630
    ) -> RoomWeekDto.Meeting {
        RoomWeekDto.Meeting(
            userId: userId,
            occurrenceId: occurrenceId,
            courseId: courseId,
            courseName: courseName,
            courseColor: courseColor,
            date: date,
            startMinute: startMinute,
            endMinute: endMinute
        )
    }

    private func recurringMeeting(
        userId: String = "u1",
        timetableId: String = "tt_1",
        courseId: String = "c1",
        courseName: String = "Course",
        courseColor: String? = "#123456",
        dayOfWeek: Int = 3,
        startPeriodIndex: Int = 1,
        periodCount: Int = 1
    ) -> RoomWeekDto.RecurringMeeting {
        RoomWeekDto.RecurringMeeting(
            userId: userId,
            timetableId: timetableId,
            courseId: courseId,
            courseName: courseName,
            courseColor: courseColor,
            dayOfWeek: dayOfWeek,
            startPeriodIndex: startPeriodIndex,
            periodCount: periodCount
        )
    }

    private func week(
        members: [RoomWeekDto.Member] = [],
        meetings: [RoomWeekDto.Meeting] = [],
        recurringMeetings: [RoomWeekDto.RecurringMeeting] = []
    ) -> RoomWeekDto {
        RoomWeekDto(
            weekStart: "2026-07-01",
            weekEnd: "2026-07-07",
            members: members,
            meetings: meetings,
            recurringMeetings: recurringMeetings
        )
    }

    func testDefaultSlots() {
        let slots = RoomTimetableLogic.defaultSlots

        XCTAssertEqual(slots.count, 5)
        XCTAssertEqual(slots.map(\.periodIndex), [1, 2, 3, 4, 5])
        XCTAssertEqual(slots.map(\.startMinute), [540, 640, 780, 880, 980])
        XCTAssertEqual(slots.map(\.endMinute), [630, 730, 870, 970, 1070])
    }

    // ── Reviewer-independent buildRecurringEvents tests (design I1-I9) ──────────

    // I1: day/period/span + all field mapping (single recurring meeting).
    func testRecurringI1MapsAllFields() {
        let events = RoomTimetableLogic.buildRecurringEvents(week: week(
            members: [member("u1", name: "Alice", color: "#0f0")],
            recurringMeetings: [
                recurringMeeting(userId: "u1", courseId: "c1", courseName: "Math",
                                 courseColor: "#123", dayOfWeek: 3, startPeriodIndex: 1, periodCount: 2),
            ]
        ))
        XCTAssertEqual(events.count, 1)
        let e = events[0]
        XCTAssertEqual(e.dayOfWeek, 3)           // JS 3 (Wed) -> display 3
        XCTAssertEqual(e.startPeriodIndex, 1)
        XCTAssertEqual(e.periodCount, 2)
        XCTAssertEqual(e.color, "#123")          // course color present wins
        XCTAssertEqual(e.title, "Math")
        XCTAssertEqual(e.subtitle, "Alice")      // member name
        XCTAssertEqual(e.mergeKey, "u1:c1")
        XCTAssertEqual(e.id, "u1:c1:3:1")        // userId:courseId:displayDow:sp
    }

    // I2: DayConvention.jsToDisplay boundaries (0=Sun->7, 1=Mon->1, 6=Sat->6).
    func testRecurringI2DayConversionBoundaries() {
        func dow(_ js: Int, _ courseId: String) -> Int {
            RoomTimetableLogic.buildRecurringEvents(week: week(
                members: [member("u1")],
                recurringMeetings: [recurringMeeting(userId: "u1", courseId: courseId, dayOfWeek: js)]
            ))[0].dayOfWeek
        }
        XCTAssertEqual(dow(0, "cSun"), 7)
        XCTAssertEqual(dow(1, "cMon"), 1)
        XCTAssertEqual(dow(6, "cSat"), 6)
    }

    // I3: color fallback chain: course color -> member color -> "#F97316".
    func testRecurringI3ColorFallback() {
        // course color nil + member present -> member color
        let withMember = RoomTimetableLogic.buildRecurringEvents(week: week(
            members: [member("u1", color: "#0f0")],
            recurringMeetings: [recurringMeeting(userId: "u1", courseId: "c1", courseColor: nil)]
        ))
        XCTAssertEqual(withMember[0].color, "#0f0")

        // course color nil + member absent -> hardcoded default
        let noMember = RoomTimetableLogic.buildRecurringEvents(week: week(
            members: [],
            recurringMeetings: [recurringMeeting(userId: "ghost", courseId: "c1", courseColor: nil)]
        ))
        XCTAssertEqual(noMember[0].color, "#F97316")

        // course color present -> course color
        let withCourse = RoomTimetableLogic.buildRecurringEvents(week: week(
            members: [member("u1", color: "#0f0")],
            recurringMeetings: [recurringMeeting(userId: "u1", courseId: "c1", courseColor: "#abcdef")]
        ))
        XCTAssertEqual(withCourse[0].color, "#abcdef")
    }

    // I4: subtitle fallback: name -> handle -> "No name".
    func testRecurringI4SubtitleFallback() {
        let named = RoomTimetableLogic.buildRecurringEvents(week: week(
            members: [member("u1", name: "Alice", handle: "al", color: "#0f0")],
            recurringMeetings: [recurringMeeting(userId: "u1", courseId: "c1")]
        ))
        XCTAssertEqual(named[0].subtitle, "Alice")

        let handleOnly = RoomTimetableLogic.buildRecurringEvents(week: week(
            members: [member("u1", name: nil, handle: "al", color: "#0f0")],
            recurringMeetings: [recurringMeeting(userId: "u1", courseId: "c1")]
        ))
        XCTAssertEqual(handleOnly[0].subtitle, "al")

        let neither = RoomTimetableLogic.buildRecurringEvents(week: week(
            members: [member("u1", name: nil, handle: nil, color: "#0f0")],
            recurringMeetings: [recurringMeeting(userId: "u1", courseId: "c1")]
        ))
        XCTAssertEqual(neither[0].subtitle, "No name")
    }

    // I5: two members in the same slot -> two distinct events, no dedup (different userId).
    func testRecurringI5MultipleMembersSameSlotNotDeduped() {
        let events = RoomTimetableLogic.buildRecurringEvents(week: week(
            members: [member("u1"), member("u2")],
            recurringMeetings: [
                recurringMeeting(userId: "u1", courseId: "cy", courseName: "Y", dayOfWeek: 3, startPeriodIndex: 2),
                recurringMeeting(userId: "u2", courseId: "cz", courseName: "Z", dayOfWeek: 3, startPeriodIndex: 2),
            ]
        ))
        XCTAssertEqual(events.count, 2)
        // both present, identified by id / mergeKey (order between equal keys not specified)
        let ids = Set(events.map(\.id))
        XCTAssertEqual(ids, ["u1:cy:3:2", "u2:cz:3:2"])
        let mergeKeys = Set(events.compactMap(\.mergeKey))
        XCTAssertEqual(mergeKeys, ["u1:cy", "u2:cz"])
    }

    // I6: identical userId:courseId:dow:sp collapses to one (keeps first seen).
    func testRecurringI6DedupSameKey() {
        let events = RoomTimetableLogic.buildRecurringEvents(week: week(
            members: [member("u1")],
            recurringMeetings: [
                recurringMeeting(userId: "u1", courseId: "c1", courseName: "First", dayOfWeek: 3, startPeriodIndex: 2),
                recurringMeeting(userId: "u1", courseId: "c1", courseName: "Duplicate", dayOfWeek: 3, startPeriodIndex: 2),
            ]
        ))
        XCTAssertEqual(events.count, 1)
        XCTAssertEqual(events[0].title, "First")   // first seen kept
    }

    // I7: empty recurringMeetings -> empty output.
    func testRecurringI7Empty() {
        XCTAssertEqual(RoomTimetableLogic.buildRecurringEvents(week: week(recurringMeetings: [])), [])
    }

    // I8: periodCount 0 (invalid) clamped up to 1 via max(1, ...).
    func testRecurringI8PeriodCountFloor() {
        let events = RoomTimetableLogic.buildRecurringEvents(week: week(
            members: [member("u1")],
            recurringMeetings: [recurringMeeting(userId: "u1", courseId: "c1", dayOfWeek: 1, periodCount: 0)]
        ))
        XCTAssertEqual(events[0].periodCount, 1)
    }

    // I9: sort by dayOfWeek asc, then startPeriodIndex asc within the same day.
    func testRecurringI9Sort() {
        // input: 金1 (dow5 sp1), 月3 (dow1 sp3), 水1 (dow3 sp1) -> 月3, 水1, 金1
        let dayOrder = RoomTimetableLogic.buildRecurringEvents(week: week(
            members: [member("u1")],
            recurringMeetings: [
                recurringMeeting(userId: "u1", courseId: "fri", courseName: "Fri", dayOfWeek: 5, startPeriodIndex: 1),
                recurringMeeting(userId: "u1", courseId: "mon", courseName: "Mon", dayOfWeek: 1, startPeriodIndex: 3),
                recurringMeeting(userId: "u1", courseId: "wed", courseName: "Wed", dayOfWeek: 3, startPeriodIndex: 1),
            ]
        ))
        XCTAssertEqual(dayOrder.map(\.title), ["Mon", "Wed", "Fri"])

        // same-day, distinct sp -> ascending by sp (deterministic, not order-of-input)
        let sameDay = RoomTimetableLogic.buildRecurringEvents(week: week(
            members: [member("u1")],
            recurringMeetings: [
                recurringMeeting(userId: "u1", courseId: "c3", courseName: "P3", dayOfWeek: 3, startPeriodIndex: 3),
                recurringMeeting(userId: "u1", courseId: "c1", courseName: "P1", dayOfWeek: 3, startPeriodIndex: 1),
                recurringMeeting(userId: "u1", courseId: "c2", courseName: "P2", dayOfWeek: 3, startPeriodIndex: 2),
            ]
        ))
        XCTAssertEqual(sameDay.map(\.startPeriodIndex), [1, 2, 3])
        XCTAssertEqual(sameDay.map(\.title), ["P1", "P2", "P3"])
    }

    func testDisplayDaysIncludesWeekdaysAndAdditionalDaysSorted() {
        XCTAssertEqual(RoomTimetableLogic.displayDays(events: []), [1, 2, 3, 4, 5])

        let sunday = TimetableEventInput(
            id: "sun",
            dayOfWeek: 7,
            startPeriodIndex: 1,
            periodCount: 1,
            color: "#111111",
            title: "Sunday",
            subtitle: nil,
            mergeKey: nil
        )
        let wednesday = TimetableEventInput(
            id: "wed",
            dayOfWeek: 3,
            startPeriodIndex: 1,
            periodCount: 1,
            color: "#111111",
            title: "Wednesday",
            subtitle: nil,
            mergeKey: nil
        )

        XCTAssertEqual(RoomTimetableLogic.displayDays(events: [sunday]), [1, 2, 3, 4, 5, 7])
        XCTAssertEqual(RoomTimetableLogic.displayDays(events: [wednesday]), [1, 2, 3, 4, 5])
    }

    func testRoomInviteCodeParse() {
        XCTAssertEqual(RoomInviteCode.parse("  ABC123  "), "ABC123")
        XCTAssertEqual(RoomInviteCode.parse("https://atender.appily.run/rooms/join/XYZ"), "XYZ")
        XCTAssertEqual(RoomInviteCode.parse("https://atender.appily.run/rooms/join/XYZ/"), "XYZ")
        XCTAssertEqual(RoomInviteCode.parse("CODE"), "CODE")
        XCTAssertEqual(RoomInviteCode.parse("/a/b/c"), "c")
    }

}
