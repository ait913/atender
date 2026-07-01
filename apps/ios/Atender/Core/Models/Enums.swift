import Foundation

protocol UnknownFallbackRawRepresentable: RawRepresentable, Codable where RawValue == String {
    static var unknown: Self { get }
}

extension UnknownFallbackRawRepresentable {
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let value = (try? container.decode(String.self)) ?? ""
        self = Self(rawValue: value) ?? .unknown
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }
}

enum AttendanceStatus: String, CaseIterable, Identifiable, UnknownFallbackRawRepresentable {
    case present = "PRESENT"
    case absent = "ABSENT"
    case excused = "EXCUSED"
    case tardy = "TARDY"
    case earlyLeave = "EARLY_LEAVE"
    case cancelled = "CANCELLED"
    case unknown

    var id: String { rawValue }

    var label: String {
        switch self {
        case .present: return "出席"
        case .absent: return "欠席"
        case .excused: return "公欠"
        case .tardy: return "遅刻"
        case .earlyLeave: return "早退"
        case .cancelled: return "休講"
        case .unknown: return "未記録"
        }
    }
}

enum AttendanceDayStatus: String, UnknownFallbackRawRepresentable {
    case allPresent = "ALL_PRESENT"
    case hasAbsent = "HAS_ABSENT"
    case hasTardy = "HAS_TARDY"
    case allSuspended = "ALL_SUSPENDED"
    case partialUnrecorded = "PARTIAL_UNRECORDED"
    case noClass = "NO_CLASS"
    case unknown
}

enum BulkMode: String, Codable {
    case fill = "FILL"
    case overwrite = "OVERWRITE"
}

enum FriendshipStatus: String, UnknownFallbackRawRepresentable {
    case pending = "PENDING"
    case accepted = "ACCEPTED"
    case declined = "DECLINED"
    case blocked = "BLOCKED"
    case unknown
}

enum RoomRole: String, UnknownFallbackRawRepresentable {
    case owner = "OWNER"
    case member = "MEMBER"
    case unknown
}

enum RuleStrategy: String, UnknownFallbackRawRepresentable {
    case countAsPresent = "COUNT_AS_PRESENT"
    case countAsAbsent = "COUNT_AS_ABSENT"
    case halfPresent = "HALF_PRESENT"
    case reduceDenominator = "REDUCE_DENOMINATOR"
    case separateCount = "SEPARATE_COUNT"
    case unknown
}

enum SchoolKind: String, UnknownFallbackRawRepresentable {
    case university = "UNIVERSITY"
    case juniorCollege = "JUNIOR_COLLEGE"
    case technicalCollege = "TECHNICAL_COLLEGE"
    case vocationalSchool = "VOCATIONAL_SCHOOL"
    case highSchool = "HIGH_SCHOOL"
    case other = "OTHER"
    case unknown
}

enum VisibilityMode: String, UnknownFallbackRawRepresentable {
    case normal = "NORMAL"
    case titleMapped = "TITLE_MAPPED"
    case busyOnly = "BUSY_ONLY"
    case unknown
}

enum RoomEventSource: String, UnknownFallbackRawRepresentable {
    case manual = "MANUAL"
    case icsFile = "ICS_FILE"
    case icsUrl = "ICS_URL"
    case googleOauth = "GOOGLE_OAUTH"
    case unknown
}

enum IcsSource: String, UnknownFallbackRawRepresentable {
    case icsFile = "ICS_FILE"
    case icsUrl = "ICS_URL"
    case googleOauth = "GOOGLE_OAUTH"
    case unknown
}

enum IcsImportStatus: String, UnknownFallbackRawRepresentable {
    case pending = "PENDING"
    case parsed = "PARSED"
    case success = "SUCCESS"
    case partialError = "PARTIAL_ERROR"
    case failed = "FAILED"
    case unknown
}

enum IcsMatchType: String, UnknownFallbackRawRepresentable {
    case equals = "EQUALS"
    case contains = "CONTAINS"
    case regex = "REGEX"
    case unknown
}

enum GoogleConnectionStatus: String, UnknownFallbackRawRepresentable {
    case active = "ACTIVE"
    case revoked = "REVOKED"
    case error = "ERROR"
    case unknown
}

enum GoogleAccessRole: String, UnknownFallbackRawRepresentable {
    case owner
    case writer
    case reader
    case freeBusyReader
    case unknown
}

enum GoogleSyncStatus: String, UnknownFallbackRawRepresentable {
    case idle = "IDLE"
    case syncing = "SYNCING"
    case ok = "OK"
    case failed = "FAILED"
    case revoked = "REVOKED"
    case unknown
}
