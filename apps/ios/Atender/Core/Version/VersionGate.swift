enum VersionGateState: Equatable {
    case unknown
    case ok
    case blocked(minBuild: Int?)
}

enum VersionGate {
    /// currentBuild が不明なら false (通す)。境界は「>= は通す」
    static func isBlocked(currentBuild: Int?, minIOSBuild: Int) -> Bool {
        guard let currentBuild else { return false }
        return currentBuild < minIOSBuild
    }
}
