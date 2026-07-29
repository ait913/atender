// 設計doc: .designs/20260729-eventkit-dedicated-calendar-export.md §5.4 / §8 PL
import XCTest
@testable import Atender

final class CalendarExportPlannerTests: XCTestCase {
    private let allKinds: Set<ExportKind> = [.meeting, .personal]

    private func item(
        key: String,
        title: String = "情報数学",
        start: Date = jstDate("2026-07-23T09:00:00"),
        end: Date = jstDate("2026-07-23T10:30:00"),
        isAllDay: Bool = false,
        location: String? = "301",
        notes: String? = "1限"
    ) -> ExportItem {
        ExportItem(key: key, title: title, start: start, end: end, isAllDay: isAllDay, location: location, notes: notes)
    }

    private func existing(
        _ item: ExportItem,
        eventIdentifier: String,
        key: String? = nil,
        title: String? = nil,
        start: Date? = nil,
        end: Date? = nil,
        isAllDay: Bool? = nil,
        location: String?? = nil,
        notes: String?? = nil
    ) -> ExportedEvent {
        ExportedEvent(
            key: key ?? item.key,
            eventIdentifier: eventIdentifier,
            title: title ?? item.title,
            start: start ?? item.start,
            end: end ?? item.end,
            isAllDay: isAllDay ?? item.isAllDay,
            location: location ?? item.location,
            notes: notes ?? item.notes
        )
    }

    private func meetingKey(_ offset: Int) -> String {
        ExportKey.meeting(meetingId: "mt1", date: "2026-07-23", firstPeriodOffset: offset)
    }
    private func personalKey(_ hour: Int) -> String {
        ExportKey.personal(seriesId: "s1", occurrenceDate: jstDate(String(format: "2026-07-23T%02d:00:00", hour)))
    }

    // MARK: - plan

    func testPL1AllNew() {
        let desired = [item(key: meetingKey(0)), item(key: meetingKey(2)), item(key: personalKey(19))]
        let plan = CalendarExportPlanner.plan(desired: desired, existing: [], prunableKinds: allKinds)
        XCTAssertEqual(plan.creates.count, 3)
        XCTAssertEqual(plan.updates.count, 0)
        XCTAssertEqual(plan.deletes.count, 0)
        XCTAssertEqual(plan.unchanged, 0)
    }

    func testPL2Unchanged() {
        let desired = [item(key: meetingKey(0)), item(key: meetingKey(2)), item(key: personalKey(19))]
        let existings = desired.enumerated().map { existing($0.element, eventIdentifier: "ev-\($0.offset)") }
        let plan = CalendarExportPlanner.plan(desired: desired, existing: existings, prunableKinds: allKinds)
        XCTAssertEqual(plan.unchanged, 3)
        XCTAssertEqual(plan.creates.count, 0)
        XCTAssertEqual(plan.updates.count, 0)
        XCTAssertEqual(plan.deletes.count, 0)
    }

    func testPL3TitleChangeBecomesUpdate() {
        let desired = [item(key: meetingKey(0), title: "情報数学 (改)")]
        let existings = [existing(item(key: meetingKey(0)), eventIdentifier: "ev-1")]
        let plan = CalendarExportPlanner.plan(desired: desired, existing: existings, prunableKinds: allKinds)
        XCTAssertEqual(plan.updates.count, 1)
        XCTAssertEqual(plan.updates.first?.eventIdentifier, "ev-1")
        XCTAssertEqual(plan.updates.first?.item.title, "情報数学 (改)")
    }

    func testPL4TimeChangeBecomesUpdate() {
        let base = item(key: meetingKey(0))
        let existings = [existing(base, eventIdentifier: "ev-1", end: base.end.addingTimeInterval(60))]
        let plan = CalendarExportPlanner.plan(desired: [base], existing: existings, prunableKinds: allKinds)
        XCTAssertEqual(plan.updates.count, 1)
        XCTAssertEqual(plan.unchanged, 0)
    }

    func testPL5DeletesWhenDesiredIsEmpty() {
        let existings = [
            existing(item(key: meetingKey(0)), eventIdentifier: "ev-1"),
            existing(item(key: personalKey(19)), eventIdentifier: "ev-2"),
        ]
        let plan = CalendarExportPlanner.plan(desired: [], existing: existings, prunableKinds: allKinds)
        XCTAssertEqual(Set(plan.deletes), ["ev-1", "ev-2"])
    }

    func testPL6PrunableKindsProtectsOtherKinds() {
        let existings = [
            existing(item(key: meetingKey(0)), eventIdentifier: "ev-m"),
            existing(item(key: personalKey(19)), eventIdentifier: "ev-p"),
        ]
        let plan = CalendarExportPlanner.plan(desired: [], existing: existings, prunableKinds: [.personal])
        XCTAssertEqual(plan.deletes, ["ev-p"])
    }

    func testPL7ForeignEventsAreNeverTouched() {
        let foreign = ExportedEvent(
            key: nil, eventIdentifier: "ev-foreign", title: "手で作った予定",
            start: jstDate("2026-07-23T09:00:00"), end: jstDate("2026-07-23T10:00:00"),
            isAllDay: false, location: nil, notes: nil
        )
        let plan = CalendarExportPlanner.plan(desired: [], existing: [foreign], prunableKinds: allKinds)
        XCTAssertEqual(plan.deletes, [])
        XCTAssertEqual(plan.foreign, 1)
    }

    func testPL8DuplicateKeysSelfHeal() {
        let base = item(key: meetingKey(0))
        let existings = [
            existing(base, eventIdentifier: "ev-b"),
            existing(base, eventIdentifier: "ev-a"),
        ]
        let plan = CalendarExportPlanner.plan(desired: [base], existing: existings, prunableKinds: allKinds)
        XCTAssertEqual(plan.deletes, ["ev-b"])
        XCTAssertEqual(plan.unchanged + plan.updates.count, 1)
        if let update = plan.updates.first {
            XCTAssertEqual(update.eventIdentifier, "ev-a")
        }
    }

    func testPL9Deterministic() {
        let desired = [item(key: meetingKey(0)), item(key: meetingKey(2))]
        let existings = [
            existing(item(key: meetingKey(2)), eventIdentifier: "ev-2"),
            existing(item(key: personalKey(19)), eventIdentifier: "ev-p"),
        ]
        let a = CalendarExportPlanner.plan(desired: desired, existing: existings, prunableKinds: allKinds)
        let b = CalendarExportPlanner.plan(desired: desired, existing: existings, prunableKinds: allKinds)
        XCTAssertEqual(a, b)
        let reversed = CalendarExportPlanner.plan(desired: desired, existing: existings.reversed(), prunableKinds: allKinds)
        XCTAssertEqual(Set(reversed.deletes), Set(a.deletes))
    }

    // MARK: - isSame

    func testPL10AllDayEndExpressedAsNextMidnightIsSame() {
        let item = ExportItem(
            key: personalKey(0), title: "休み",
            start: jstDate("2026-07-23T00:00:00"), end: jstDate("2026-07-23T23:59:59"),
            isAllDay: true, location: nil, notes: nil
        )
        let existing = ExportedEvent(
            key: item.key, eventIdentifier: "ev-1", title: "休み",
            start: jstDate("2026-07-23T00:00:00"), end: jstDate("2026-07-24T00:00:00"),
            isAllDay: true, location: nil, notes: nil
        )
        XCTAssertTrue(CalendarExportPlanner.isSame(item, existing))
    }

    func testPL11AllDayDifferentLastDayIsDifferent() {
        let item = ExportItem(
            key: personalKey(0), title: "休み",
            start: jstDate("2026-07-23T00:00:00"), end: jstDate("2026-07-23T23:59:59"),
            isAllDay: true, location: nil, notes: nil
        )
        let existing = ExportedEvent(
            key: item.key, eventIdentifier: "ev-1", title: "休み",
            start: jstDate("2026-07-23T00:00:00"), end: jstDate("2026-07-25T00:00:00"),
            isAllDay: true, location: nil, notes: nil
        )
        XCTAssertFalse(CalendarExportPlanner.isSame(item, existing))
    }

    func testPL12NilAndEmptyTextAreSame() {
        let base = item(key: meetingKey(0), location: nil, notes: nil)
        let a = existing(base, eventIdentifier: "ev-1", location: .some(""), notes: .some(nil))
        XCTAssertTrue(CalendarExportPlanner.isSame(base, a))
        let b = existing(base, eventIdentifier: "ev-1", location: .some(nil), notes: .some("  "))
        XCTAssertTrue(CalendarExportPlanner.isSame(base, b))
        XCTAssertNil(CalendarExportPlanner.normalizedText("   "))
        XCTAssertNil(CalendarExportPlanner.normalizedText(nil))
        XCTAssertEqual(CalendarExportPlanner.normalizedText(" 301 "), "301")
    }

    func testPL13SubSecondDifferenceIsSame() {
        let base = item(key: meetingKey(0))
        let near = existing(base, eventIdentifier: "ev-1", start: base.start.addingTimeInterval(0.4))
        XCTAssertTrue(CalendarExportPlanner.isSame(base, near))
        let far = existing(base, eventIdentifier: "ev-1", start: base.start.addingTimeInterval(1.0))
        XCTAssertFalse(CalendarExportPlanner.isSame(base, far))
    }

    func testPL14AllDayFlagDifferenceIsDifferent() {
        let base = item(key: meetingKey(0))
        let flipped = existing(base, eventIdentifier: "ev-1", isAllDay: true)
        XCTAssertFalse(CalendarExportPlanner.isSame(base, flipped))
    }

    func testPL15ShouldVerifyIdentity() {
        var plan = ExportPlan()
        plan.creates = [item(key: meetingKey(0)), item(key: meetingKey(2)), item(key: personalKey(19))]
        XCTAssertTrue(CalendarExportPlanner.shouldVerifyIdentity(plan: plan, existingOwnedCount: 0))
        XCTAssertFalse(CalendarExportPlanner.shouldVerifyIdentity(plan: plan, existingOwnedCount: 1))
        XCTAssertFalse(CalendarExportPlanner.shouldVerifyIdentity(plan: ExportPlan(), existingOwnedCount: 0))
    }
}
