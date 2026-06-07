import Foundation

enum AttendanceStatus: String, Codable, CaseIterable, Identifiable {
    case present = "PRESENT"
    case absent = "ABSENT"
    case excused = "EXCUSED"
    case tardy = "TARDY"
    case earlyLeave = "EARLY_LEAVE"
    case cancelled = "CANCELLED"
    case unknown

    var id: String { rawValue }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let value = (try? container.decode(String.self)) ?? ""
        self = AttendanceStatus(rawValue: value) ?? .unknown
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }

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

enum AttendanceDayStatus: String, Codable {
    case allPresent = "ALL_PRESENT"
    case hasAbsent = "HAS_ABSENT"
    case hasTardy = "HAS_TARDY"
    case allSuspended = "ALL_SUSPENDED"
    case partialUnrecorded = "PARTIAL_UNRECORDED"
    case noClass = "NO_CLASS"
    case unknown

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let value = (try? container.decode(String.self)) ?? ""
        self = AttendanceDayStatus(rawValue: value) ?? .unknown
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }
}
