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

    private func roomEvent(
        id: String = "event_1",
        seriesId: String = "series_1",
        authorId: String = "u1",
        title: String = "Room Event",
        start: String = "2026-07-01T09:00:00.000Z",
        end: String = "2026-07-01T10:00:00.000Z",
        source: RoomEventSource = .manual,
        occurrenceDate: String = "2026-07-01"
    ) -> RoomEventDto {
        RoomEventDto(
            id: id,
            seriesId: seriesId,
            roomId: "room_1",
            authorId: authorId,
            title: title,
            rawTitle: nil,
            description: nil,
            start: start,
            end: end,
            isAllDay: false,
            color: nil,
            source: source,
            visibilityMode: .normal,
            isRecurringOccurrence: false,
            recurrenceRule: nil,
            occurrenceDate: occurrenceDate,
            overrideId: nil,
            googleSyncId: nil,
            googleEventId: nil,
            googleRecurringEventId: nil,
            createdAt: "2026-07-01T00:00:00.000Z"
        )
    }

    private func week(
        members: [RoomWeekDto.Member] = [],
        meetings: [RoomWeekDto.Meeting] = [],
        recurringMeetings: [RoomWeekDto.RecurringMeeting] = [],
        roomEvents: [RoomEventDto] = []
    ) -> RoomWeekDto {
        RoomWeekDto(
            weekStart: "2026-07-01",
            weekEnd: "2026-07-07",
            members: members,
            meetings: meetings,
            recurringMeetings: recurringMeetings,
            roomEvents: roomEvents
        )
    }

    private func calendarEvent(
        ownerId: String?,
        startMinute: Int,
        endMinute: Int,
        id: String = "e"
    ) -> CalendarEvent {
        var event = CalendarEvent(
            kind: .personal,
            id: id,
            date: "2026-07-01",
            title: id,
            startMinute: startMinute,
            endMinute: endMinute,
            color: "#111111",
            subtitle: "",
            courseId: nil
        )
        event.ownerId = ownerId
        return event
    }

    private func utcDate(_ y: Int, _ mo: Int, _ d: Int, _ h: Int = 0, _ mi: Int = 0) -> Date {
        var c = DateComponents()
        c.year = y
        c.month = mo
        c.day = d
        c.hour = h
        c.minute = mi
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        return cal.date(from: c)!
    }

    func testRoomEventTimingUsesJSTWallClockForUTCInput() {
        let timing = RoomEventTiming.timing(
            startISO: "2026-07-01T09:00:00.000Z",
            endISO: "2026-07-01T10:00:00.000Z"
        )

        XCTAssertEqual(timing.date, "2026-07-01")
        XCTAssertEqual(timing.startMinute, 1080)
        XCTAssertEqual(timing.endMinute, 1140)
    }

    func testRoomEventTimingKeepsExplicitJSTWallClock() {
        let timing = RoomEventTiming.timing(
            startISO: "2026-07-01T09:00:00+09:00",
            endISO: "2026-07-01T10:00:00+09:00"
        )

        XCTAssertEqual(timing.date, "2026-07-01")
        XCTAssertEqual(timing.startMinute, 540)
    }

    func testRoomEventTimingRollsUTCMidnightToNextJSTDate() {
        let timing = RoomEventTiming.timing(
            startISO: "2026-06-30T15:00:00.000Z",
            endISO: "2026-06-30T16:00:00.000Z"
        )

        XCTAssertEqual(timing.date, "2026-07-01")
        XCTAssertEqual(timing.startMinute, 0)
    }

    func testSourceColorMapping() {
        XCTAssertEqual(RoomCalendarLogic.sourceColor(.googleOauth, authorColor: "#abc"), "#38bdf8")
        XCTAssertEqual(RoomCalendarLogic.sourceColor(.icsFile, authorColor: "#abc"), "#94a3b8")
        XCTAssertEqual(RoomCalendarLogic.sourceColor(.icsUrl, authorColor: "#abc"), "#94a3b8")
        XCTAssertEqual(RoomCalendarLogic.sourceColor(.manual, authorColor: "#abc"), "#abc")
        XCTAssertEqual(RoomCalendarLogic.sourceColor(.unknown, authorColor: "#abc"), "#abc")
    }

    func testBuildCalendarEventsDedupsAndSortsMeetingsAndRoomEvents() {
        let weeks = [
            week(
                members: [member("u1", name: "Alice", color: "#0f0")],
                meetings: [
                    meeting(occurrenceId: "dup", courseName: "Late", date: "2026-07-02", startMinute: 600, endMinute: 660),
                    meeting(occurrenceId: "early", courseName: "Early", date: "2026-07-01", startMinute: 540, endMinute: 570),
                ],
                roomEvents: [
                    roomEvent(id: "room_late", seriesId: "s1", title: "Room Late", start: "2026-07-01T03:00:00.000Z", end: "2026-07-01T04:00:00.000Z", occurrenceDate: "2026-07-01"),
                ]
            ),
            week(
                members: [member("u1", name: "Alice", color: "#0f0")],
                meetings: [
                    meeting(occurrenceId: "dup", courseName: "Duplicate", date: "2026-07-03", startMinute: 540, endMinute: 570),
                ],
                roomEvents: [
                    roomEvent(id: "room_dup", seriesId: "s1", title: "Duplicate Room", start: "2026-07-01T05:00:00.000Z", end: "2026-07-01T06:00:00.000Z", occurrenceDate: "2026-07-01"),
                ]
            ),
        ]

        let events = RoomCalendarLogic.buildCalendarEvents(weeks: weeks)

        XCTAssertEqual(events.count, 3)
        XCTAssertEqual(events.map(\.title), ["Early", "Room Late", "Late"])
        XCTAssertEqual(events.map(\.date), ["2026-07-01", "2026-07-01", "2026-07-02"])
        XCTAssertEqual(events.map(\.startMinute), [540, 720, 600])
    }

    func testBuildCalendarEventsMapsMeetingFieldsAndFallbacks() {
        let known = RoomCalendarLogic.buildCalendarEvents(weeks: [
            week(members: [member("u1", name: nil, handle: "alice", color: "#0f0")], meetings: [
                meeting(userId: "u1", courseColor: nil),
            ]),
        ])[0]

        XCTAssertEqual(known.kind, .meeting)
        XCTAssertEqual(known.date, "2026-07-01")
        XCTAssertEqual(known.startMinute, 540)
        XCTAssertEqual(known.endMinute, 630)
        XCTAssertEqual(known.color, "#0f0")
        XCTAssertEqual(known.subtitle, "alice")
        XCTAssertEqual(known.ownerId, "u1")
        XCTAssertEqual(known.courseId, "c1")

        let missing = RoomCalendarLogic.buildCalendarEvents(weeks: [
            week(meetings: [meeting(userId: "missing", courseColor: nil)]),
        ])[0]

        XCTAssertEqual(missing.subtitle, "No name")
        XCTAssertEqual(missing.color, MemberColor.memberColor("missing"))
    }

    func testBuildCalendarEventsMapsRoomEventFieldsAndColors() {
        let manual = RoomCalendarLogic.buildCalendarEvents(weeks: [
            week(members: [member("u1", name: "Alice", color: "#0f0")], roomEvents: [
                roomEvent(source: .manual),
            ]),
        ])[0]

        XCTAssertEqual(manual.kind, .roomEvent)
        XCTAssertEqual(manual.ownerId, "u1")
        XCTAssertEqual(manual.source, .manual)
        XCTAssertEqual(manual.color, "#0f0")
        XCTAssertEqual(manual.date, "2026-07-01")
        XCTAssertEqual(manual.startMinute, 1080)
        XCTAssertEqual(manual.endMinute, 1140)

        let google = RoomCalendarLogic.buildCalendarEvents(weeks: [
            week(members: [member("u1", color: "#0f0")], roomEvents: [roomEvent(source: .googleOauth)]),
        ])[0]
        let ics = RoomCalendarLogic.buildCalendarEvents(weeks: [
            week(members: [member("u1", color: "#0f0")], roomEvents: [roomEvent(source: .icsUrl)]),
        ])[0]

        XCTAssertEqual(google.color, "#38bdf8")
        XCTAssertEqual(ics.color, "#94a3b8")
    }

    func testBuildCalendarEventsEmptyWeeks() {
        XCTAssertEqual(RoomCalendarLogic.buildCalendarEvents(weeks: []), [])
    }

    func testAvailabilityComputesEighteenSlotsAndIgnoresNilOwner() {
        let result = RoomAvailability.compute(
            members: [member("a")],
            events: [
                calendarEvent(ownerId: "a", startMinute: 540, endMinute: 570),
                calendarEvent(ownerId: nil, startMinute: 540, endMinute: 600),
            ]
        )

        XCTAssertEqual(result.combined.count, 18)
        XCTAssertEqual(result.perMember.count, 1)
        XCTAssertEqual(result.combined[0], 1)
        XCTAssertEqual(Array(result.combined.dropFirst()), Array(repeating: 0, count: 17))
        XCTAssertEqual(result.perMember[0].userId, "a")
        XCTAssertTrue(result.perMember[0].busy[0])
        XCTAssertEqual(Array(result.perMember[0].busy.dropFirst()), Array(repeating: false, count: 17))
    }

    func testAvailabilityMarksMultiSlotOverlap() {
        let result = RoomAvailability.compute(
            members: [member("a")],
            events: [
                calendarEvent(ownerId: "a", startMinute: 540, endMinute: 600, id: "two_slots"),
            ]
        )

        XCTAssertEqual(Array(result.combined.prefix(3)), [1, 1, 0])
        XCTAssertEqual(result.perMember[0].busy[0], true)
        XCTAssertEqual(result.perMember[0].busy[1], true)
        XCTAssertEqual(result.perMember[0].busy[2], false)
    }

    func testAvailabilityUsesStrictStartBeforeSlotEndBoundary() {
        let result = RoomAvailability.compute(
            members: [member("a")],
            events: [
                calendarEvent(ownerId: "a", startMinute: 570, endMinute: 600, id: "boundary"),
            ]
        )

        XCTAssertEqual(Array(result.combined.prefix(3)), [0, 1, 0])
        XCTAssertFalse(result.perMember[0].busy[0])
        XCTAssertTrue(result.perMember[0].busy[1])
        XCTAssertFalse(result.perMember[0].busy[2])
    }

    func testAvailabilityEmptyMembers() {
        let result = RoomAvailability.compute(members: [], events: [calendarEvent(ownerId: "a", startMinute: 540, endMinute: 570)])

        XCTAssertEqual(result.combined, Array(repeating: 0, count: 18))
        XCTAssertTrue(result.perMember.isEmpty)
    }

    func testDefaultSlots() {
        let slots = RoomTimetableLogic.defaultSlots

        XCTAssertEqual(slots.count, 5)
        XCTAssertEqual(slots.map(\.periodIndex), [1, 2, 3, 4, 5])
        XCTAssertEqual(slots.map(\.startMinute), [540, 640, 780, 880, 980])
        XCTAssertEqual(slots.map(\.endMinute), [630, 730, 870, 970, 1070])
    }

    func testBuildRecurringEventsMapsDayPeriodSpanAndFields() {
        let events = RoomTimetableLogic.buildRecurringEvents(week: week(
            members: [member("u1", name: "Alice", color: "#0f0")],
            recurringMeetings: [
                recurringMeeting(userId: "u1", courseId: "c1", courseName: "Math", courseColor: "#123", dayOfWeek: 3, startPeriodIndex: 1, periodCount: 2),
            ]
        ))

        XCTAssertEqual(events.count, 1)
        XCTAssertEqual(events[0].dayOfWeek, 3)
        XCTAssertEqual(events[0].startPeriodIndex, 1)
        XCTAssertEqual(events[0].periodCount, 2)
        XCTAssertEqual(events[0].color, "#123")
        XCTAssertEqual(events[0].title, "Math")
        XCTAssertEqual(events[0].subtitle, "Alice")
        XCTAssertEqual(events[0].mergeKey, "u1:c1")
        XCTAssertEqual(events[0].id, "u1:c1:3:1")
    }

    func testBuildRecurringEventsHandlesBoundariesFallbacksAndPeriodMinimum() {
        let events = RoomTimetableLogic.buildRecurringEvents(week: week(
            members: [member("u1", handle: "alice", color: "#0f0")],
            recurringMeetings: [
                recurringMeeting(userId: "u1", courseId: "c1", courseName: "Monday", courseColor: nil, dayOfWeek: 1, periodCount: 0),
                recurringMeeting(userId: "missing", courseId: "c2", courseName: "Sunday", courseColor: nil, dayOfWeek: 0),
                recurringMeeting(userId: "u1", courseId: "c3", courseName: "Saturday", courseColor: "#123", dayOfWeek: 6),
            ]
        ))

        let byTitle = Dictionary(uniqueKeysWithValues: events.map { ($0.title, $0) })
        XCTAssertEqual(byTitle["Monday"]?.dayOfWeek, 1)
        XCTAssertEqual(byTitle["Monday"]?.periodCount, 1)
        XCTAssertEqual(byTitle["Monday"]?.color, "#0f0")
        XCTAssertEqual(byTitle["Monday"]?.subtitle, "alice")
        XCTAssertEqual(byTitle["Sunday"]?.dayOfWeek, 7)
        XCTAssertEqual(byTitle["Sunday"]?.color, "#F97316")
        XCTAssertEqual(byTitle["Sunday"]?.subtitle, "No name")
        XCTAssertEqual(byTitle["Saturday"]?.dayOfWeek, 6)
    }

    func testBuildRecurringEventsDedupsKeepsMultipleMembersAndSorts() {
        let events = RoomTimetableLogic.buildRecurringEvents(week: week(
            members: [member("u1"), member("u2")],
            recurringMeetings: [
                recurringMeeting(userId: "u1", courseId: "fri", courseName: "Friday", dayOfWeek: 5, startPeriodIndex: 1),
                recurringMeeting(userId: "u1", courseId: "mon", courseName: "Monday", dayOfWeek: 1, startPeriodIndex: 3),
                recurringMeeting(userId: "u1", courseId: "c1", courseName: "First", dayOfWeek: 3, startPeriodIndex: 2),
                recurringMeeting(userId: "u1", courseId: "c1", courseName: "Duplicate", dayOfWeek: 3, startPeriodIndex: 2),
                recurringMeeting(userId: "u2", courseId: "c1", courseName: "Second", dayOfWeek: 3, startPeriodIndex: 2),
            ]
        ))

        XCTAssertEqual(events.count, 4)
        XCTAssertEqual(events.map(\.title), ["Monday", "First", "Second", "Friday"])
        XCTAssertEqual(events.filter { $0.startPeriodIndex == 2 && $0.dayOfWeek == 3 }.count, 2)
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

    func testRecurrencePresetConversions() {
        let start = utcDate(2026, 7, 1)

        XCTAssertEqual(RecurrencePresetLogic.presetToRRule("daily", start: start), "FREQ=DAILY")
        XCTAssertEqual(RecurrencePresetLogic.presetToRRule("weekly", start: start), "FREQ=WEEKLY;BYDAY=WE")
        XCTAssertEqual(RecurrencePresetLogic.presetToRRule("weekday", start: start), "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR")
        XCTAssertEqual(RecurrencePresetLogic.presetToRRule("monthly_bymonthday", start: start), "FREQ=MONTHLY;BYMONTHDAY=1")
        XCTAssertEqual(RecurrencePresetLogic.presetToRRule("monthly_byday", start: start), "FREQ=MONTHLY;BYDAY=1WE")
        XCTAssertEqual(RecurrencePresetLogic.presetToRRule("yearly", start: start), "FREQ=YEARLY;BYMONTH=7;BYMONTHDAY=1")
        XCTAssertNil(RecurrencePresetLogic.presetToRRule("none", start: start))
        XCTAssertNil(RecurrencePresetLogic.presetToRRule("bogus", start: start))
    }

    func testRecurrenceTextAndCurrentPreset() {
        let start = utcDate(2026, 7, 1)

        XCTAssertEqual(RecurrencePresetLogic.recurrenceToText("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", start: start), "平日のみ")
        XCTAssertEqual(RecurrencePresetLogic.recurrenceToText("FREQ=DAILY", start: start), "毎日")
        XCTAssertEqual(RecurrencePresetLogic.recurrenceToText(nil, start: start), "繰り返しなし")
        XCTAssertEqual(RecurrencePresetLogic.currentPreset("FREQ=WEEKLY;BYDAY=WE", start: start), "weekly")
        XCTAssertEqual(RecurrencePresetLogic.currentPreset("FREQ=DAILY", start: start), "daily")
        XCTAssertEqual(RecurrencePresetLogic.currentPreset(nil, start: start), "none")
        XCTAssertEqual(RecurrencePresetLogic.currentPreset("FREQ=UNKNOWN;XYZ", start: start), "none")
    }

    func testRoomInviteCodeParse() {
        XCTAssertEqual(RoomInviteCode.parse("  ABC123  "), "ABC123")
        XCTAssertEqual(RoomInviteCode.parse("https://atender.appily.run/rooms/join/XYZ"), "XYZ")
        XCTAssertEqual(RoomInviteCode.parse("https://atender.appily.run/rooms/join/XYZ/"), "XYZ")
        XCTAssertEqual(RoomInviteCode.parse("CODE"), "CODE")
        XCTAssertEqual(RoomInviteCode.parse("/a/b/c"), "c")
    }

    func testRoomCardUpcomingLabelAndTemplateAuthorHandle() {
        XCTAssertEqual(RoomCardLogic.upcomingLabel(start: "2026-07-01T09:00:00Z", title: "会議"), "07-01 09:00 · 会議")

        let template = TemplateDto(
            id: "template_1",
            authorUserId: "user_1",
            schoolId: "school_1",
            departmentId: "department_1",
            title: "Template",
            description: nil,
            year: nil,
            term: nil,
            isPublic: true,
            copyCount: 0,
            daySlots: [],
            courses: [],
            meetings: [],
            createdAt: "2026-07-01T00:00:00.000Z",
            updatedAt: "2026-07-01T00:00:00.000Z",
            schoolName: "サンプル学校",
            departmentName: "サンプル学科"
        )

        XCTAssertEqual(TemplateLogic.authorHandle(template), "user_1")
    }
}
