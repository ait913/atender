// 設計doc: .designs/20260729-eventkit-dedicated-calendar-export.md §5.1 / §8 CAL
import XCTest
@testable import Atender

final class AtenderCalendarResolverTests: XCTestCase {
    private let icloud = EKSourceSnapshot(id: "src-icloud", title: "iCloud", kind: .calDAV)
    private let local = EKSourceSnapshot(id: "src-local", title: "このiPhone内", kind: .local)

    private var standardSources: [EKSourceSnapshot] { [icloud, local] }

    private func cal(
        _ id: String,
        title: String = "Atender",
        sourceId: String = "src-icloud",
        allowsModify: Bool = true,
        allowsEvents: Bool = true
    ) -> EKCalendarSnapshot {
        EKCalendarSnapshot(
            id: id, title: title, sourceId: sourceId, sourceTitle: sourceId,
            colorHex: nil, allowsModify: allowsModify, allowsEvents: allowsEvents
        )
    }

    private func resolve(
        storedId: String? = nil,
        calendars: [EKCalendarSnapshot],
        sources: [EKSourceSnapshot]? = nil,
        defaultCalendarSourceId: String? = "src-icloud",
        allowCreate: Bool = true
    ) -> CalendarResolution {
        AtenderCalendarResolver.resolve(
            storedId: storedId,
            calendars: calendars,
            sources: sources ?? standardSources,
            defaultCalendarSourceId: defaultCalendarSourceId,
            allowCreate: allowCreate
        )
    }

    func testCAL1StoredIdWins() {
        XCTAssertEqual(resolve(storedId: "cal-1", calendars: [cal("cal-1")]), .use("cal-1"))
    }

    func testCAL2StoredIdMissingFallsBackToTitle() {
        XCTAssertEqual(resolve(storedId: "cal-old", calendars: [cal("cal-2")]), .use("cal-2"))
    }

    func testCAL3NoIdNoTitleCreatesNew() {
        XCTAssertEqual(
            resolve(calendars: [cal("cal-9", title: "仕事")]),
            .createNew(sourceId: "src-icloud")
        )
    }

    func testCAL4EmptyCalendarsNeverCreates() {
        XCTAssertEqual(resolve(calendars: []), .unavailable(.calendarLookupTransient))
    }

    func testCAL5AllowCreateFalse() {
        XCTAssertEqual(
            resolve(calendars: [cal("cal-9", title: "仕事")], allowCreate: false),
            .unavailable(.calendarLookupTransient)
        )
    }

    func testCAL6MultipleTitleMatchesPrefersDefaultSource() {
        let calendars = [cal("cal-b", sourceId: "src-local"), cal("cal-a", sourceId: "src-icloud")]
        XCTAssertEqual(resolve(calendars: calendars), .use("cal-a"))
    }

    func testCAL7MultipleTitleMatchesOutsideDefaultSourceUsesIdOrder() {
        let calendars = [cal("cal-b", sourceId: "src-local"), cal("cal-a", sourceId: "src-local")]
        XCTAssertEqual(resolve(calendars: calendars), .use("cal-a"))
    }

    func testCAL8ReadOnlyCalendarIsIgnored() {
        let calendars = [cal("cal-ro", allowsModify: false)]
        XCTAssertEqual(resolve(calendars: calendars), .createNew(sourceId: "src-icloud"))
        XCTAssertEqual(
            resolve(calendars: calendars, allowCreate: false),
            .unavailable(.calendarLookupTransient)
        )
    }

    func testCAL9EventUnsupportedCalendarIsIgnored() {
        let calendars = [cal("cal-rem", allowsEvents: false)]
        XCTAssertEqual(resolve(calendars: calendars), .createNew(sourceId: "src-icloud"))
        XCTAssertEqual(
            resolve(calendars: calendars, allowCreate: false),
            .unavailable(.calendarLookupTransient)
        )
    }

    func testCAL10TitleMatchIsExact() {
        for title in ["atender", "Atender ", "Atender 予定"] {
            XCTAssertEqual(
                resolve(calendars: [cal("cal-x", title: title)]),
                .createNew(sourceId: "src-icloud"),
                "[CAL10] \(title)"
            )
        }
    }

    func testCAL11NoWritableSource() {
        let subscribed = EKSourceSnapshot(id: "src-sub", title: "購読", kind: .subscribed)
        XCTAssertEqual(
            resolve(
                calendars: [cal("cal-9", title: "祝日", sourceId: "src-sub")],
                sources: [subscribed],
                defaultCalendarSourceId: "src-sub"
            ),
            .unavailable(.noWritableSource)
        )
    }

    func testCAL12WritableSourcePriority() {
        XCTAssertEqual(
            AtenderCalendarResolver.writableSourceId(sources: standardSources, defaultCalendarSourceId: "src-icloud"),
            "src-icloud"
        )
        XCTAssertEqual(
            AtenderCalendarResolver.writableSourceId(sources: [local, icloud], defaultCalendarSourceId: nil),
            "src-icloud",
            "[CAL12] default が無ければ calDAV を local より優先する"
        )
        let birthdays = EKSourceSnapshot(id: "src-birthdays", title: "誕生日", kind: .birthdays)
        XCTAssertEqual(
            AtenderCalendarResolver.writableSourceId(
                sources: [birthdays, local, icloud],
                defaultCalendarSourceId: "src-birthdays"
            ),
            "src-icloud"
        )
        XCTAssertEqual(
            AtenderCalendarResolver.writableSourceId(sources: [local], defaultCalendarSourceId: nil),
            "src-local"
        )
        XCTAssertNil(AtenderCalendarResolver.writableSourceId(sources: [], defaultCalendarSourceId: nil))
    }
}
