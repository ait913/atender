import SwiftUI
import UIKit

struct VersionGateView: View {
    let currentBuild: Int?
    let minBuild: Int?
    /// 既定は実 UIApplication 判定。テストは直接注入する
    var canOpenTestFlight: Bool = VersionGateView.canOpenTestFlightByDefault
    /// 設計 §7.3 は `() -> Void` だが、既定値の openTestFlightByDefault は UIApplication.shared
    /// (MainActor 隔離) を触るため @MainActor が推論される。Swift 6 では非隔離の関数型へ代入すると
    /// "loses global actor 'MainActor'" で compile error になるため型に @MainActor を明示する。
    /// 注入可能性・同期セマンティクスは設計のまま。
    var onOpenTestFlight: @MainActor () -> Void = VersionGateView.openTestFlightByDefault

    static let testFlightURL = URL(string: "itms-beta://")!
    static var canOpenTestFlightByDefault: Bool { UIApplication.shared.canOpenURL(testFlightURL) }
    static func openTestFlightByDefault() { UIApplication.shared.open(testFlightURL) }

    var body: some View {
        ContentUnavailableView {
            Label("アプリの更新が必要です", systemImage: "arrow.down.circle")
        } description: {
            VStack {
                Text("このバージョンは現在のサーバーと通信できません。TestFlight から最新版に更新してください。")
                let diagnostics = Self.diagnosticsText(currentBuild: currentBuild, minBuild: minBuild)
                if !diagnostics.isEmpty {
                    Text(diagnostics)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
        } actions: {
            if canOpenTestFlight {
                Button("TestFlight を開く", action: onOpenTestFlight)
                    .buttonStyle(.borderedProminent)
            }
        }
    }

    /// 診断行の文字列。純関数として切り出し、テストはここを検証する
    static func diagnosticsText(currentBuild: Int?, minBuild: Int?) -> String {
        switch (currentBuild, minBuild) {
        case let (currentBuild?, minBuild?):
            return "ビルド \(currentBuild) / 必要 \(minBuild) 以上"
        case let (currentBuild?, nil):
            return "ビルド \(currentBuild)"
        case let (nil, minBuild?):
            return "必要 \(minBuild) 以上"
        case (nil, nil):
            return ""
        }
    }
}
