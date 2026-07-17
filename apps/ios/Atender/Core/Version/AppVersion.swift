import Foundation

enum AppVersion {
    /// CFBundleVersion 文字列 → build 番号。解釈できなければ nil (= 版数を名乗らない)
    static func build(from bundleVersion: String?) -> Int? {
        guard let trimmed = bundleVersion?.trimmingCharacters(in: .whitespaces), !trimmed.isEmpty else { return nil }
        return Int(trimmed)
    }

    /// 実バンドルの build。Info.plist は project.yml から生成される (正典は project.yml)
    static let current: Int? = build(from: Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String)

    static let clientHeaderField = "X-Atender-Client"

    /// build が無ければ nil = ヘッダを送らない (フェイルオープン)
    static func clientHeaderValue(build: Int?) -> String? {
        build.map { "ios/\($0)" }
    }
}
