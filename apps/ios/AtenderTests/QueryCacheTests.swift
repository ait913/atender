import XCTest
@testable import Atender

@MainActor
final class QueryCacheTests: XCTestCase {

    func testQueryKeyHasPrefix() {
        XCTAssertTrue(QueryKey(["today", "current"]).hasPrefix(QueryKey(["today"])))
        XCTAssertFalse(QueryKey(["stats", "s1"]).hasPrefix(QueryKey(["today"])))
        XCTAssertTrue(QueryKey(["rooms", "r1", "week", "2026-06-01"]).hasPrefix(QueryKey(["rooms", "r1", "week"])))
        XCTAssertFalse(QueryKey(["rooms", "r1"]).hasPrefix(QueryKey(["rooms", "r1", "week"])))
    }

    func testQueryClientSetInvalidateSnapshotRestoreAndRemoveAll() {
        let client = QueryClient()
        let todayKey = QueryKey(["today", "current"])
        let statsKey = QueryKey(["stats", "s1"])

        client.setData("today-v1", for: todayKey)
        client.setData("stats-v1", for: statsKey)

        XCTAssertEqual(client.data(for: todayKey, as: String.self), "today-v1")
        XCTAssertEqual(client.data(for: statsKey, as: String.self), "stats-v1")
        XCTAssertFalse(client.isStale(todayKey))
        XCTAssertFalse(client.isStale(statsKey))

        client.invalidate(prefix: QueryKey(["today"]))
        XCTAssertTrue(client.isStale(todayKey))
        XCTAssertFalse(client.isStale(statsKey))

        let snapshot = client.snapshot(matching: QueryKey(["today"]), as: String.self)
        client.setData("today-v2", for: todayKey)
        XCTAssertEqual(client.data(for: todayKey, as: String.self), "today-v2")

        client.restore(snapshot)
        XCTAssertEqual(client.data(for: todayKey, as: String.self), "today-v1")

        client.removeAll()
        XCTAssertNil(client.data(for: todayKey, as: String.self))
        XCTAssertNil(client.data(for: statsKey, as: String.self))
    }

    func testPhaseAInvalidationTargets() {
        assertTargets(.patchAttendance, [
            QueryKey(["stats"]),
            QueryKey(["semesters"]),
            QueryKey(["day"]),
        ], excluded: [QueryKey(["today"])])

        assertTargets(.deleteAttendance, [
            QueryKey(["today"]),
            QueryKey(["stats"]),
            QueryKey(["semesters"]),
            QueryKey(["day"]),
        ])

        assertTargets(.markAllPresent, [
            QueryKey(["stats"]),
            QueryKey(["semesters"]),
            QueryKey(["day"]),
        ], excluded: [QueryKey(["today"])])

        assertTargets(.bulkAttendance, [
            QueryKey(["semesters"]),
            QueryKey(["stats"]),
            QueryKey(["day"]),
            QueryKey(["today"]),
            QueryKey(["timetable-suspensions"]),
        ])

        assertTargets(.courseSuspension(courseId: "c1"), [
            QueryKey(["courses", "c1", "suspensions"]),
            QueryKey(["semesters"]),
            QueryKey(["stats"]),
            QueryKey(["day"]),
        ])

        assertTargets(.timetableSuspension(date: "2026-06-01"), [
            QueryKey(["timetable-suspensions"]),
            QueryKey(["day"]),
            QueryKey(["semesters"]),
            QueryKey(["stats"]),
            QueryKey(["today"]),
            QueryKey(["day", "2026-06-01"]),
        ])

        assertTargets(.personalEvent(date: "2026-06-01"), [
            QueryKey(["personal-events"]),
            QueryKey(["day"]),
            QueryKey(["day", "2026-06-01"]),
        ])

        assertTargets(.meUpdate, [
            QueryKey(["users", "search"]),
            QueryKey(["semesters"]),
            QueryKey(["stats"]),
        ])
    }

    private func assertTargets(
        _ mutation: Mutation,
        _ expected: Set<QueryKey>,
        excluded: Set<QueryKey> = [],
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        let actual = Set(invalidationTargets(for: mutation))
        XCTAssertEqual(actual, expected, file: file, line: line)
        for key in excluded {
            XCTAssertFalse(actual.contains(key), "Unexpected invalidation target: \(key)", file: file, line: line)
        }
    }
}
