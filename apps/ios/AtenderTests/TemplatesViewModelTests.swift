import XCTest
@testable import Atender

@MainActor
final class TemplatesViewModelTests: XCTestCase {
    private func XCTAssertSchoolStep(
        _ step: TemplatesViewModel.Step,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        guard case .school = step else {
            XCTFail("Expected .school step, got \(step)", file: file, line: line)
            return
        }
    }

    private func XCTAssertDepartmentStep(
        _ step: TemplatesViewModel.Step,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        guard case .department = step else {
            XCTFail("Expected .department step, got \(step)", file: file, line: line)
            return
        }
    }

    private func XCTAssertListStep(
        _ step: TemplatesViewModel.Step,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        guard case .list = step else {
            XCTFail("Expected .list step, got \(step)", file: file, line: line)
            return
        }
    }

    private func makeDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .useDefaultKeys
        return decoder
    }

    private func loadFixture(_ name: String) throws -> Data {
        let bundle = Bundle(for: type(of: self))
        guard let url = bundle.url(forResource: name, withExtension: "json", subdirectory: "Fixtures")
            ?? bundle.url(forResource: name, withExtension: "json") else {
            throw XCTSkip("Fixture \(name).json がテストバンドルに含まれていない")
        }
        return try Data(contentsOf: url)
    }

    private func decodeSchool() throws -> SchoolDto {
        try makeDecoder().decode(SchoolDto.self, from: loadFixture("school"))
    }

    private func decodeDepartment() throws -> DepartmentDto {
        try makeDecoder().decode(DepartmentDto.self, from: loadFixture("department"))
    }

    func testInitialStateStartsAtSchoolStepWithEmptyCollections() {
        let model = TemplatesViewModel(env: AppEnvironment())

        XCTAssertSchoolStep(model.step)
        XCTAssertTrue(model.schools.isEmpty)
        XCTAssertTrue(model.departments.isEmpty)
        XCTAssertTrue(model.templates.isEmpty)
    }

    func testSelectSchoolMovesToDepartmentStepAndClearsDownstreamState() throws {
        let model = TemplatesViewModel(env: AppEnvironment())
        let school = try decodeSchool()

        model.departmentQuery = "old department"
        model.titleQuery = "old title"
        model.selectSchool(school)

        XCTAssertEqual(model.selectedSchool?.id, school.id)
        XCTAssertDepartmentStep(model.step)
        XCTAssertNil(model.selectedDepartment)
        XCTAssertTrue(model.departments.isEmpty)
        XCTAssertTrue(model.templates.isEmpty)
        XCTAssertEqual(model.departmentQuery, "")
        XCTAssertEqual(model.titleQuery, "")
    }

    func testSelectDepartmentMovesToListStepAndClearsTitleQuery() throws {
        let model = TemplatesViewModel(env: AppEnvironment())
        let school = try decodeSchool()
        let department = try decodeDepartment()

        model.selectSchool(school)
        model.titleQuery = "old title"
        model.selectDepartment(department)

        XCTAssertEqual(model.selectedDepartment?.id, department.id)
        XCTAssertListStep(model.step)
        XCTAssertEqual(model.titleQuery, "")
    }

    func testBackToSchoolFromListClearsSelectionAndDownstreamState() throws {
        let model = TemplatesViewModel(env: AppEnvironment())
        let school = try decodeSchool()
        let department = try decodeDepartment()

        model.selectSchool(school)
        model.selectDepartment(department)
        model.backToSchool()

        XCTAssertSchoolStep(model.step)
        XCTAssertNil(model.selectedSchool)
        XCTAssertNil(model.selectedDepartment)
        XCTAssertTrue(model.departments.isEmpty)
        XCTAssertTrue(model.templates.isEmpty)
    }

    func testBackToDepartmentFromListKeepsSchoolAndClearsDepartmentSelectionAndTemplates() throws {
        let model = TemplatesViewModel(env: AppEnvironment())
        let school = try decodeSchool()
        let department = try decodeDepartment()

        model.selectSchool(school)
        model.selectDepartment(department)
        model.backToDepartment()

        XCTAssertDepartmentStep(model.step)
        XCTAssertEqual(model.selectedSchool?.id, school.id)
        XCTAssertNil(model.selectedDepartment)
        XCTAssertTrue(model.templates.isEmpty)
    }

    func testTemplateDtoDecodesSchoolAndDepartmentNames() throws {
        let json = """
        {
          "id": "template_01",
          "authorUserId": "user_01",
          "schoolId": "school_01",
          "departmentId": "department_01",
          "title": "春学期テンプレート",
          "description": null,
          "year": null,
          "term": "spring",
          "isPublic": true,
          "copyCount": 12,
          "daySlots": [
            {
              "periodIndex": 1,
              "label": "1限",
              "startMinute": 540,
              "endMinute": 630,
              "isBreak": false
            },
            {
              "periodIndex": 2,
              "label": "2限",
              "startMinute": 640,
              "endMinute": 730,
              "isBreak": false
            }
          ],
          "courses": [
            {
              "id": "course_01",
              "name": "情報デザイン",
              "teacher": null,
              "color": "#f97316",
              "note": null
            }
          ],
          "meetings": [
            {
              "id": "meeting_01",
              "courseId": "course_01",
              "dayOfWeek": 1,
              "startPeriodIndex": 1,
              "periodCount": 1,
              "room": null
            }
          ],
          "createdAt": "2026-06-01T00:00:00.000Z",
          "updatedAt": "2026-06-01T00:00:00.000Z",
          "schoolName": "○○大学",
          "departmentName": "情報処理科"
        }
        """.data(using: .utf8)!

        let template = try makeDecoder().decode(TemplateDto.self, from: json)

        XCTAssertEqual(template.schoolName, "○○大学")
        XCTAssertEqual(template.departmentName, "情報処理科")
    }

    func testTemplateDtoWithoutSchoolAndDepartmentNamesThrows() throws {
        // 新2フィールドを欠く JSON (非 Optional の確認 / B6)
        let missingNames = """
        {
          "id": "template_01",
          "authorUserId": "user_01",
          "schoolId": "school_01",
          "departmentId": "department_01",
          "title": "春学期テンプレート",
          "description": null,
          "year": null,
          "term": "spring",
          "isPublic": true,
          "copyCount": 12,
          "daySlots": [],
          "courses": [],
          "meetings": [],
          "createdAt": "2026-06-01T00:00:00.000Z",
          "updatedAt": "2026-06-01T00:00:00.000Z"
        }
        """.data(using: .utf8)!

        XCTAssertThrowsError(try makeDecoder().decode(TemplateDto.self, from: missingNames))
    }

    func testTemplatesEndpointQueryIncludesSchoolDepartmentTitleAndLimit() {
        let query = Endpoints.templates(
            TemplateSearchQuery(schoolId: "S", departmentId: "D", q: "OS", limit: 20)
        ).query

        XCTAssertEqual(query["schoolId"], "S")
        XCTAssertEqual(query["departmentId"], "D")
        XCTAssertEqual(query["q"], "OS")
        XCTAssertEqual(query["limit"], "20")
    }

    func testTemplatesEndpointQueryOmitsNilTitleQuery() {
        let query = Endpoints.templates(
            TemplateSearchQuery(schoolId: "S", departmentId: "D", q: nil, limit: 20)
        ).query

        XCTAssertEqual(query["schoolId"], "S")
        XCTAssertEqual(query["departmentId"], "D")
        XCTAssertNil(query["q"])
        XCTAssertEqual(query["limit"], "20")
    }
}
