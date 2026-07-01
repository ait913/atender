import XCTest
@testable import Atender

// Reviewer 生成: 設計 §DTO デコード (Phase A DTODecodingTests 拡張) を根拠に検証。
final class DTODecodingPhaseBTests: XCTestCase {

    private let decoder = JSONDecoder()

    func testAttendanceRecordResponseWithNullStatus() throws {
        let json = #"{"record":{"occurrenceId":"o1","status":null,"note":null,"updatedAt":"2026-06-08T00:00:00Z"}}"#
        let decoded = try decoder.decode(AttendanceRecordResponse.self, from: json.data(using: .utf8)!)
        XCTAssertEqual(decoded.record.occurrenceId, "o1")
        XCTAssertNil(decoded.record.status)
        XCTAssertNil(decoded.record.note)
        XCTAssertEqual(decoded.record.updatedAt, "2026-06-08T00:00:00Z")
    }

    func testAttendanceRecordResponseWithValue() throws {
        let json = #"{"record":{"occurrenceId":"o1","status":"EXCUSED","note":"公欠","updatedAt":"2026-06-08T00:00:00Z"}}"#
        let decoded = try decoder.decode(AttendanceRecordResponse.self, from: json.data(using: .utf8)!)
        XCTAssertEqual(decoded.record.status, .excused)
        XCTAssertEqual(decoded.record.note, "公欠")
    }

    func testUserTimetableCreateInputEncodesWebBodyKeys() throws {
        let input = UserTimetableCreateInput(
            semesterId: "sem_1",
            title: "自分の時間割",
            daySlots: [.init(periodIndex: 1, label: "1限", startMinute: 540, endMinute: 630, isBreak: false)],
            courses: [],
            meetings: []
        )
        let data = try JSONEncoder().encode(input)
        let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        let keys = Set((obj ?? [:]).keys)
        // Web body 形状 (キー名) と一致
        XCTAssertTrue(keys.isSuperset(of: ["semesterId", "title", "daySlots", "courses", "meetings"]),
                      "keys=\(keys)")
        // daySlots のフィールド名 (periodIndex/label/startMinute/endMinute/isBreak)
        let slot = ((obj?["daySlots"] as? [[String: Any]])?.first) ?? [:]
        XCTAssertTrue(Set(slot.keys).isSuperset(of: ["periodIndex", "label", "startMinute", "endMinute", "isBreak"]),
                      "slotKeys=\(slot.keys)")
    }

    func testUserTimetablePatchInputEncodesKeys() throws {
        let input = UserTimetablePatchInput(
            title: "新タイトル",
            daysOfWeek: [1, 2, 3],
            daySlots: [.init(periodIndex: 1, label: "1限", startMinute: 540, endMinute: 630, isBreak: false)]
        )
        let data = try JSONEncoder().encode(input)
        let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        let keys = Set((obj ?? [:]).keys)
        XCTAssertTrue(keys.isSuperset(of: ["title", "daysOfWeek", "daySlots"]), "keys=\(keys)")
    }
}
