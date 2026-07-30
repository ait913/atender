import SwiftUI
import UIKit
import XCTest
@testable import Atender

@MainActor
final class B16CalendarDaySheetLogicTests: XCTestCase {

    private func meetingEvent(id: String,
                              date: String = "2026-07-15",
                              title: String = "予定",
                              startMinute: Int = 540,
                              endMinute: Int = 630,
                              color: String = "#FF00FF",
                              subtitle: String = "作成者",
                              courseId: String = "") -> CalendarEvent {
        CalendarEvent(kind: .meeting,
                      id: id,
                      date: date,
                      title: title,
                      startMinute: startMinute,
                      endMinute: endMinute,
                      color: color,
                      subtitle: subtitle,
                      courseId: courseId)
    }

    private func personalCalendarEvent(id: String,
                                       date: String = "2026-07-15",
                                       title: String = "予定",
                                       startMinute: Int = 540,
                                       endMinute: Int = 630,
                                       color: String = "#FF00FF",
                                       subtitle: String = "作成者",
                                       courseId: String = "") -> CalendarEvent {
        CalendarEvent(kind: .personal,
                      id: id,
                      date: date,
                      title: title,
                      startMinute: startMinute,
                      endMinute: endMinute,
                      color: color,
                      subtitle: subtitle,
                      courseId: courseId)
    }

    private func roomCalendarEvent(id: String,
                                   date: String = "2026-07-15",
                                   title: String = "予定",
                                   startMinute: Int = 540,
                                   endMinute: Int = 630,
                                   color: String = "#FF00FF",
                                   subtitle: String = "作成者",
                                   courseId: String = "") -> CalendarEvent {
        CalendarEvent(kind: .roomEvent,
                      id: id,
                      date: date,
                      title: title,
                      startMinute: startMinute,
                      endMinute: endMinute,
                      color: color,
                      subtitle: subtitle,
                      courseId: courseId)
    }

    private func occurrence(seriesId: String = "s1",
                            occurrenceDate: String = "2026-07-15",
                            title: String = "バイト",
                            location: String? = nil,
                            color: String? = nil,
                            isRecurringOccurrence: Bool = false) -> PersonalEventOccurrenceDto {
        PersonalEventOccurrenceDto(
            seriesId: seriesId,
            occurrenceDate: occurrenceDate,
            start: "2026-07-15T00:00:00.000Z",
            end: "2026-07-15T01:30:00.000Z",
            days: [],
            isAllDay: false,
            title: title,
            location: location,
            note: nil,
            color: color,
            isRecurringOccurrence: isRecurringOccurrence,
            recurrenceRule: nil,
            recurrenceSpec: nil,
            overrideId: nil,
            source: "MANUAL",
            ekExternalId: nil,
            ekCalendarId: nil,
            createdAt: "2026-07-01T00:00:00.000Z",
            updatedAt: "2026-07-01T00:00:00.000Z")
    }

    func testD1InitialPathForViewIsEmpty() {
        XCTAssertEqual(CalendarDaySheetLogic.initialPath(intent: .view, date: "2026-07-15"),
                       [],
                       "[build16 #D1]")
    }

    func testD2InitialPathForCreateStartsAtEditor() {
        XCTAssertEqual(CalendarDaySheetLogic.initialPath(intent: .create, date: "2026-07-15"),
                       [.create(date: "2026-07-15")],
                       "[build16 #D2]")
    }

    func testD3EditorTitles() {
        XCTAssertEqual(CalendarDaySheetLogic.editorTitle(.create(date: "2026-07-15")),
                       "予定を追加",
                       "[build16 #D3]")
        XCTAssertEqual(CalendarDaySheetLogic.editorTitle(.edit(rowId: "s1:2026-07-15", date: "2026-07-15")),
                       "予定を編集",
                       "[build16 #D3]")
    }

    func testD4PersonalSectionsOmitEmptyMeetingsSection() {
        let sections = CalendarDaySheetLogic.personalSections(date: "2026-07-15",
                                                              meetings: [],
                                                              occurrences: [])

        XCTAssertFalse(sections.map(\.id).contains("meetings"), "[build16 #D4]")
        XCTAssertTrue(sections.map(\.id).contains("events"), "[build16 #D4] events セクションは常に返す")
    }

    func testD5PersonalSectionsIncludeNonEditableMeetingsInOrder() {
        let meetings = [
            meetingEvent(id: "m1", title: "授業1", startMinute: 540, endMinute: 630),
            meetingEvent(id: "m2", title: "授業2", startMinute: 640, endMinute: 730)
        ]

        let sections = CalendarDaySheetLogic.personalSections(date: "2026-07-15",
                                                              meetings: meetings,
                                                              occurrences: [])

        XCTAssertEqual(sections.map(\.id), ["meetings", "events"], "[build16 #D5] section order")
        let meetingSection = sections.first { $0.id == "meetings" }
        XCTAssertEqual(meetingSection?.title, "授業 (2)", "[build16 #D5]")
        XCTAssertEqual(meetingSection?.rows.count, 2, "[build16 #D5]")
        XCTAssertTrue(meetingSection?.rows.allSatisfy { $0.editorTarget == nil } ?? false,
                      "[build16 #D5] 授業行はタップ不可")
        XCTAssertEqual(meetingSection?.rows.first?.detail,
                       PersonalDaySheetFormat.timeRange(startMinute: meetings[0].startMinute,
                                                        endMinute: meetings[0].endMinute),
                       "[build16 #D5] detail")
        XCTAssertFalse(meetingSection?.rows.first?.detail.isEmpty ?? true, "[build16 #D5] detail is non-empty")
    }

    func testD6PersonalSectionsIncludeEmptyEventsSection() {
        let sections = CalendarDaySheetLogic.personalSections(date: "2026-07-15",
                                                              meetings: [],
                                                              occurrences: [])

        let eventsSection = sections.first { $0.id == "events" }
        XCTAssertNotNil(eventsSection, "[build16 #D6]")
        XCTAssertEqual(eventsSection?.rows.count, 0, "[build16 #D6]")
        XCTAssertEqual(eventsSection?.emptyText, "予定はありません", "[build16 #D6]")
    }

    func testD7PersonalEventRowsHaveEditTarget() {
        let item = occurrence()
        let sections = CalendarDaySheetLogic.personalSections(date: "2026-07-15",
                                                              meetings: [],
                                                              occurrences: [item])

        let row = sections.first { $0.id == "events" }?.rows.first
        XCTAssertEqual(row?.editorTarget,
                       .edit(rowId: item.id, date: "2026-07-15"),
                       "[build16 #D7]")
        XCTAssertEqual(row?.detail,
                       PersonalDaySheetFormat.occurrenceTime(item),
                       "[build16 #D7] detail")
        XCTAssertFalse(row?.detail.isEmpty ?? true, "[build16 #D7] detail is non-empty")
    }

    func testD8PersonalEventRowsDefaultColorWhenNil() {
        let item = occurrence(color: nil)
        let sections = CalendarDaySheetLogic.personalSections(date: "2026-07-15",
                                                              meetings: [],
                                                              occurrences: [item])

        XCTAssertEqual(sections.first { $0.id == "events" }?.rows.first?.colorHex,
                       "#8b5cf6",
                       "[build16 #D8]")
    }

    func testD9PersonalEventRowsPreserveRecurrenceFlag() {
        let item = occurrence(isRecurringOccurrence: true)
        let sections = CalendarDaySheetLogic.personalSections(date: "2026-07-15",
                                                              meetings: [],
                                                              occurrences: [item])

        XCTAssertEqual(sections.first { $0.id == "events" }?.rows.first?.showsRecurrence,
                       true,
                       "[build16 #D9]")
    }

    func testD10RoomSectionsSplitKindsAndDropPersonalInOrder() {
        let roomEvent = roomCalendarEvent(id: "room:s1:2026-07-15", title: "ルーム予定")
        let meeting = meetingEvent(id: "m1", title: "メンバー授業", subtitle: "友達")
        let personal = personalCalendarEvent(id: "p1", title: "個人予定")

        let sections = CalendarDaySheetLogic.roomSections(date: "2026-07-15",
                                                          events: [meeting, personal, roomEvent])

        XCTAssertEqual(sections.map(\.id), ["events", "members"], "[build16 #D10] section order")
        XCTAssertEqual(sections.first { $0.id == "events" }?.rows.map(\.id), [roomEvent.id], "[build16 #D10]")
        XCTAssertEqual(sections.first { $0.id == "members" }?.rows.map(\.id), [meeting.id], "[build16 #D10]")
        XCTAssertFalse(sections.flatMap(\.rows).map(\.id).contains(personal.id), "[build16 #D10]")
    }

    func testD11RoomMemberRowsAreNotEditableAndUseSubtitleMeta() {
        let meeting = meetingEvent(id: "m1", subtitle: "友達")
        let sections = CalendarDaySheetLogic.roomSections(date: "2026-07-15",
                                                          events: [meeting])

        let row = sections.first { $0.id == "members" }?.rows.first
        XCTAssertNil(row?.editorTarget, "[build16 #D11]")
        XCTAssertEqual(row?.meta, meeting.subtitle, "[build16 #D11]")
    }

    func testD12RoomSectionsOmitMembersWhenNoMeetings() {
        let roomEvent = roomCalendarEvent(id: "room:s1:2026-07-15")
        let sections = CalendarDaySheetLogic.roomSections(date: "2026-07-15",
                                                          events: [roomEvent])

        XCTAssertFalse(sections.map(\.id).contains("members"), "[build16 #D12]")
        XCTAssertTrue(sections.map(\.id).contains("events"), "[build16 #D12]")
    }

    func testD13ParseRoomEventKey() {
        let parsed = RoomCalendarLogic.parseRoomEventKey("room:abc:2026-07-15")

        XCTAssertEqual(parsed?.seriesId, "abc", "[build16 #D13]")
        XCTAssertEqual(parsed?.occurrenceDate, "2026-07-15", "[build16 #D13]")
    }

    func testD14ParseRoomEventKeyRejectsInvalidShapes() {
        XCTAssertNil(RoomCalendarLogic.parseRoomEventKey("meeting:xyz"), "[build16 #D14]")
        XCTAssertNil(RoomCalendarLogic.parseRoomEventKey("room:abc"), "[build16 #D14]")
        XCTAssertNil(RoomCalendarLogic.parseRoomEventKey(""), "[build16 #D14]")
    }

    func testD15ParseRoomEventKeyKeepsColonsInOccurrenceDate() {
        let parsed = RoomCalendarLogic.parseRoomEventKey("room:abc:def:2026-07-15")

        XCTAssertEqual(parsed?.seriesId, "abc", "[build16 #D15]")
        XCTAssertEqual(parsed?.occurrenceDate, "def:2026-07-15", "[build16 #D15]")
    }

    func testRoomSectionsRoomEventRowUsesFormatterAndEditTarget() {
        let roomEvent = roomCalendarEvent(id: "room:s1:2026-07-15",
                                          startMinute: 600,
                                          endMinute: 690)

        let sections = CalendarDaySheetLogic.roomSections(date: "2026-07-15",
                                                          events: [roomEvent])

        let row = sections.first { $0.id == "events" }?.rows.first
        XCTAssertEqual(row?.editorTarget,
                       .edit(rowId: roomEvent.id, date: "2026-07-15"),
                       "[build16 #D10] room event rows are editable")
        XCTAssertEqual(row?.detail,
                       PersonalDaySheetFormat.timeRange(startMinute: roomEvent.startMinute,
                                                        endMinute: roomEvent.endMinute),
                       "[build16 #D10] detail")
        XCTAssertFalse(row?.detail.isEmpty ?? true, "[build16 #D10] detail is non-empty")
    }
}
