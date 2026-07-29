import XCTest
@testable import Atender

// Reviewer 生成: 設計doc §5.1 / §6.1 / §6.2 / §9 U4, U13, U14 を根拠に検証。実装コードは未読。
//
// U13/U14 の分離理由 (gotcha/dto-type-literal-decode-tests-bypass-repository-wiring.md):
//   型直書き decode (U13) は「DTO が読める」しか言わない。repository が client.send(_, as:) に
//   渡す型が違っても緑になる。U14 は URLProtocol スタブ + 実 APIClient + 実 Repository を通す。
//
// スタブ JSON は手打ちせず、実 API のレスポンスを採取した Fixtures/personalEventsLive.json /
// personalEventSeriesLive.json をそのまま使う。
@MainActor
final class PersonalEventContractTests: XCTestCase {

    override func tearDown() {
        StubURLProtocol.handler = nil
        StubURLProtocol.lastRequest = nil
        try? KeychainStore().delete()
        super.tearDown()
    }

    private func makeClient() throws -> APIClient {
        let keychain = KeychainStore()
        try? keychain.delete()
        try keychain.save(token: "tok")
        let auth = AuthStore(keychain: keychain, session: StubURLProtocol.makeSession())
        return APIClient(session: StubURLProtocol.makeSession(), authStore: auth)
    }

    private func liveFixture(_ name: String) throws -> String {
        let bundle = Bundle(for: type(of: self))
        guard let url = bundle.url(forResource: name, withExtension: "json", subdirectory: "Fixtures")
            ?? bundle.url(forResource: name, withExtension: "json") else {
            throw XCTSkip("Fixture \(name).json がテストバンドルに無い")
        }
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func respond(status: Int = 200, json: String) {
        StubURLProtocol.handler = { request in
            let resp = HTTPURLResponse(url: request.url!, statusCode: status,
                                       httpVersion: "HTTP/1.1",
                                       headerFields: ["Content-Type": "application/json"])!
            return (resp, json.data(using: .utf8)!)
        }
    }

    // MARK: - U13 (型直書き decode)

    func testU13DecodesOccurrenceAndComputesIdentifiableId() throws {
        let json = """
        {
          "seriesId": "series-1",
          "occurrenceDate": "2026-07-22T15:00:00.000Z",
          "start": "2026-07-22T15:00:00.000Z",
          "end": "2026-07-25T15:00:00.000Z",
          "days": [
            { "date": "2026-07-23", "startMinute": 0, "endMinute": 1440 },
            { "date": "2026-07-24", "startMinute": 0, "endMinute": 1440 }
          ],
          "isAllDay": true,
          "title": "帰省",
          "location": "実家",
          "note": null,
          "color": null,
          "isRecurringOccurrence": false,
          "recurrenceRule": null,
          "recurrenceSpec": null,
          "overrideId": null,
          "source": "MANUAL",
          "ekExternalId": null,
          "ekCalendarId": null,
          "createdAt": "2026-07-01T00:00:00.000Z",
          "updatedAt": "2026-07-01T00:00:00.000Z"
        }
        """
        let occ = try JSONDecoder().decode(PersonalEventOccurrenceDto.self, from: Data(json.utf8))

        XCTAssertEqual(occ.days.count, 2, "[#U13]")
        XCTAssertEqual(occ.days[0].startMinute, 0, "[#U13]")
        XCTAssertEqual(occ.id, "series-1:2026-07-22T15:00:00.000Z", "[#U13] id は計算プロパティ")
    }

    func testU13IgnoresWireIdKey() throws {
        // wire に id は無い契約。あっても無視して計算プロパティが勝つ
        let json = """
        {
          "id": "SHOULD-BE-IGNORED",
          "seriesId": "series-1",
          "occurrenceDate": "2026-07-22T15:00:00.000Z",
          "start": "2026-07-22T15:00:00.000Z",
          "end": "2026-07-23T15:00:00.000Z",
          "days": [{ "date": "2026-07-23", "startMinute": 0, "endMinute": 1440 }],
          "isAllDay": true, "title": "x", "location": null, "note": null, "color": null,
          "isRecurringOccurrence": false, "recurrenceRule": null, "recurrenceSpec": null,
          "overrideId": null, "source": "MANUAL", "ekExternalId": null, "ekCalendarId": null,
          "createdAt": "2026-07-01T00:00:00.000Z", "updatedAt": "2026-07-01T00:00:00.000Z"
        }
        """
        let occ = try JSONDecoder().decode(PersonalEventOccurrenceDto.self, from: Data(json.utf8))

        XCTAssertEqual(occ.id, "series-1:2026-07-22T15:00:00.000Z", "[#U13] JSON の id キーは無視される")
    }

    func testU13DecodesRecurrenceSpec() throws {
        let json = """
        {
          "seriesId": "s", "occurrenceDate": "2026-07-20T09:00:00.000Z",
          "start": "2026-07-20T09:00:00.000Z", "end": "2026-07-20T13:00:00.000Z",
          "days": [{ "date": "2026-07-20", "startMinute": 1080, "endMinute": 1320 }],
          "isAllDay": false, "title": "バイト", "location": null, "note": null, "color": null,
          "isRecurringOccurrence": true, "recurrenceRule": "FREQ=WEEKLY;BYDAY=MO,WE;COUNT=10",
          "recurrenceSpec": { "freq": "WEEKLY", "interval": 1, "byDay": ["MO","WE"],
                              "monthlyMode": null, "end": { "kind": "count", "count": 10 } },
          "overrideId": null, "source": "MANUAL", "ekExternalId": null, "ekCalendarId": null,
          "createdAt": "2026-07-01T00:00:00.000Z", "updatedAt": "2026-07-01T00:00:00.000Z"
        }
        """
        let occ = try JSONDecoder().decode(PersonalEventOccurrenceDto.self, from: Data(json.utf8))

        XCTAssertEqual(occ.recurrenceSpec?.freq, "WEEKLY", "[#U13]")
        XCTAssertEqual(occ.recurrenceSpec?.byDay, ["MO", "WE"], "[#U13]")
        XCTAssertNil(occ.recurrenceSpec?.monthlyMode, "[#U13]")
        XCTAssertEqual(occ.recurrenceSpec?.end.kind, "count", "[#U13]")
        XCTAssertEqual(occ.recurrenceSpec?.end.count, 10, "[#U13]")
        XCTAssertNil(occ.recurrenceSpec?.end.date, "[#U13] COUNT と UNTIL は同時に立たない")
    }

    // MARK: - U14 (repository 配線)

    func testU14RepositoryDecodesLiveListResponse() async throws {
        let repo = PersonalEventRepository(client: try makeClient(), cache: QueryClient())
        respond(json: try liveFixture("personalEventsLive"))

        let occurrences = try await repo.personalEvents(from: "2026-07-20", to: "2026-07-31")

        XCTAssertFalse(occurrences.isEmpty, "[#U14] 実 API 形状を repository 経由で decode できる")
        let multiDay = occurrences.first { $0.title == "帰省" }
        XCTAssertNotNil(multiDay, "[#U14]")
        XCTAssertEqual(multiDay?.days.count, 3, "[#U14] 複数日 occurrence が 1 件で days 3 件")
        XCTAssertEqual(multiDay?.days.map(\.date), ["2026-07-23", "2026-07-24", "2026-07-25"], "[#U14]")
        XCTAssertEqual(multiDay?.isAllDay, true, "[#U14]")

        let recurring = occurrences.first { $0.isRecurringOccurrence }
        XCTAssertEqual(recurring?.recurrenceRule, "FREQ=WEEKLY;BYDAY=MO,WE;COUNT=10", "[#U14]")
        XCTAssertEqual(recurring?.recurrenceSpec?.byDay, ["MO", "WE"], "[#U14]")
    }

    func testU14RepositorySendsFromAndToQuery() async throws {
        let repo = PersonalEventRepository(client: try makeClient(), cache: QueryClient())
        respond(json: try liveFixture("personalEventsLive"))

        _ = try await repo.personalEvents(from: "2026-07-20", to: "2026-07-31")
        let url = StubURLProtocol.lastRequest?.url?.absoluteString ?? ""

        XCTAssertTrue(url.contains("/api/personal-events"), "[#U14] \(url)")
        XCTAssertTrue(url.contains("from=2026-07-20"), "[#U14] from が必須クエリ: \(url)")
        XCTAssertTrue(url.contains("to=2026-07-31"), "[#U14] to が必須クエリ: \(url)")
        XCTAssertFalse(url.contains("semesterId"), "[#U14] semesterId は廃止 (T3): \(url)")
    }

    func testU14RepositoryDecodesLiveSeriesResponse() async throws {
        let repo = PersonalEventRepository(client: try makeClient(), cache: QueryClient())
        respond(status: 201, json: try liveFixture("personalEventSeriesLive"))

        let event = try await repo.createPersonalEvent(
            PersonalEventCreateInput(title: "面談",
                                     start: "2026-08-01T00:00:00.000Z",
                                     end: "2026-08-01T01:30:00.000Z")
        )

        XCTAssertEqual(event.title, "面談", "[#U14]")
        XCTAssertEqual(event.exDates, [], "[#U14]")
        XCTAssertEqual(event.rDates, [], "[#U14]")
        XCTAssertNil(event.recurrenceSpec, "[#U14]")
        XCTAssertEqual(event.source, "MANUAL", "[#U14]")
    }

    // MARK: - U4 (occurrences(on:))

    private func occ(seriesId: String, title: String, days: [OccurrenceDayDto]) -> PersonalEventOccurrenceDto {
        PersonalEventOccurrenceDto(
            seriesId: seriesId, occurrenceDate: "2026-07-22T15:00:00.000Z",
            start: "2026-07-22T15:00:00.000Z", end: "2026-07-25T15:00:00.000Z",
            days: days, isAllDay: true, title: title, location: nil, note: nil, color: nil,
            isRecurringOccurrence: false, recurrenceRule: nil, recurrenceSpec: nil, overrideId: nil,
            source: "MANUAL", ekExternalId: nil, ekCalendarId: nil,
            createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z"
        )
    }

    func testU4MultiDayOccurrenceAppearsOnEveryCoveredDay() {
        let model = PersonalCalendarViewModel(environment: AppEnvironment())
        model.occurrences = [occ(seriesId: "s-multi", title: "帰省", days: [
            OccurrenceDayDto(date: "2026-07-23", startMinute: 0, endMinute: 1440),
            OccurrenceDayDto(date: "2026-07-24", startMinute: 0, endMinute: 1440),
            OccurrenceDayDto(date: "2026-07-25", startMinute: 0, endMinute: 1440),
        ])]

        for date in ["2026-07-23", "2026-07-24", "2026-07-25"] {
            XCTAssertEqual(model.occurrences(on: date).count, 1, "[#U4] \(date)")
        }
        XCTAssertEqual(model.occurrences(on: "2026-07-22").count, 0, "[#U4] またがらない日")
        XCTAssertEqual(model.occurrences(on: "2026-07-26").count, 0, "[#U4] またがらない日")
    }

    func testU5OccurrencesOnDateAreSortedByStartMinuteThenTitle() {
        let model = PersonalCalendarViewModel(environment: AppEnvironment())
        model.occurrences = [
            occ(seriesId: "s-13", title: "13時", days: [OccurrenceDayDto(date: "2026-07-23", startMinute: 780, endMinute: 870)]),
            occ(seriesId: "s-allday", title: "終日", days: [OccurrenceDayDto(date: "2026-07-23", startMinute: 0, endMinute: 1440)]),
            occ(seriesId: "s-8", title: "8時", days: [OccurrenceDayDto(date: "2026-07-23", startMinute: 480, endMinute: 570)]),
        ]

        XCTAssertEqual(model.occurrences(on: "2026-07-23").map(\.title), ["終日", "8時", "13時"], "[#U5]")
    }
}
