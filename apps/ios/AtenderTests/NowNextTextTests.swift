import XCTest
@testable import Atender

final class NowNextTextTests: XCTestCase {

    private func occurrence(
        _ id: String,
        periodIndex: Int,
        startMinute: Int,
        endMinute: Int,
        courseName: String,
        room: String?
    ) -> OccurrenceDto {
        OccurrenceDto(id: id, meetingId: "m\(id)", courseId: "c\(id)", courseName: courseName,
                      teacher: nil, room: room, color: nil, date: "2026-06-08",
                      periodIndex: periodIndex, periodOffset: 0,
                      startMinute: startMinute, endMinute: endMinute, status: nil)
    }

    func testL1NoClassTextIsNil() {
        XCTAssertNil(NowNextText.statusLabel(.noClass), "[ui-revamp #L1]")
        XCTAssertNil(NowNextText.title(.noClass), "[ui-revamp #L1]")
        XCTAssertNil(NowNextText.detail(.noClass), "[ui-revamp #L1]")
    }

    func testL2UpcomingTextIncludesStartTimeAndRoom() {
        let next = occurrence("3", periodIndex: 3, startMinute: 780, endMinute: 870, courseName: "英語", room: "A302")
        let state = TodayState.upcoming(next: next)

        XCTAssertEqual(NowNextText.statusLabel(state), "次の授業", "[ui-revamp #L2]")
        XCTAssertEqual(NowNextText.title(state), "3限 英語", "[ui-revamp #L2]")
        XCTAssertEqual(NowNextText.detail(state), "13:00 · A302", "[ui-revamp #L2]")
    }

    func testL3InClassTextIncludesTimeRangeAndRoom() {
        let current = occurrence("1", periodIndex: 1, startMinute: 540, endMinute: 630, courseName: "情報デザイン", room: "B201")
        let next = occurrence("2", periodIndex: 2, startMinute: 640, endMinute: 730, courseName: "講義", room: nil)
        let state = TodayState.inClass(current: current, next: next)

        XCTAssertEqual(NowNextText.statusLabel(state), "授業中", "[ui-revamp #L3]")
        XCTAssertEqual(NowNextText.title(state), "1限 情報デザイン", "[ui-revamp #L3]")
        XCTAssertEqual(NowNextText.detail(state), "09:00–10:30 · B201", "[ui-revamp #L3]")
    }

    func testL4NilRoomOmitsSeparatorRemainder() {
        let next = occurrence("3", periodIndex: 3, startMinute: 780, endMinute: 870, courseName: "英語", room: nil)

        XCTAssertEqual(NowNextText.detail(.upcoming(next: next)), "13:00", "[ui-revamp #L4]")
    }

    func testL5EmptyRoomOmitsSeparatorRemainder() {
        let next = occurrence("3", periodIndex: 3, startMinute: 780, endMinute: 870, courseName: "英語", room: "")

        XCTAssertEqual(NowNextText.detail(.upcoming(next: next)), "13:00", "[ui-revamp #L5]")
    }

    func testL6FinishedText() {
        let last = occurrence("3", periodIndex: 3, startMinute: 780, endMinute: 870, courseName: "英語", room: "A302")
        let state = TodayState.finished(last: last)

        XCTAssertEqual(NowNextText.statusLabel(state), "本日終了", "[ui-revamp #L6]")
        XCTAssertEqual(NowNextText.title(state), "今日の授業は終わりました", "[ui-revamp #L6]")
        XCTAssertNil(NowNextText.detail(state), "[ui-revamp #L6]")
    }
}
