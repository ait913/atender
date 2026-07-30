import SwiftUI

/// Liquid Glass は iOS 26.0+。deployment target は 17 のまま (26 に上げると iPhone の 21% を失う)。
/// ★ ここが #available の唯一の置き場所。Feature 層に #available を書かないこと。
///   分散すると「26 で何が変わるか」がコードベース全体に散り、シムを外す日に追えなくなる。
///
/// ★ 分岐してよいのは「質感」だけ。機能・レイアウト・IA を OS 版数で分けない (§11 の不採用案を参照)。
extension View {
    /// 浮くコントロール (コンテンツの上に乗る面) にガラスを敷く。
    /// iOS 26 未満では ultraThinMaterial にフォールバックする (= 現状の質感)。
    @ViewBuilder
    func atenderGlass(in shape: some Shape) -> some View {
        if #available(iOS 26.0, *) {
            self.glassEffect(.regular, in: shape)
        } else {
            self.background(.ultraThinMaterial, in: shape)
        }
    }

    /// スクロールに応じてタブバーを縮める (iOS 26.0+)。未満では何もしない。
    @ViewBuilder
    func tabBarMinimizeOnScroll() -> some View {
        if #available(iOS 26.0, *) {
            self.tabBarMinimizeBehavior(.onScrollDown)
        } else {
            self
        }
    }
}

extension ToolbarContent {
    /// iOS 26 が toolbar item に自動で付ける glass カプセルを外し、素の中身にする。
    /// iOS 25 以下にカプセルは存在しないので何もしない (pixel diff 0 / researcher 実測)。
    @ToolbarContentBuilder
    func atenderPlainToolbarBackground() -> some ToolbarContent {
        if #available(iOS 26.0, *) {
            self.sharedBackgroundVisibility(.hidden)
        } else {
            self
        }
    }
}

enum AtenderModalToolbar {
    static let closeIdentifier = "sheet-close"
    static let backIdentifier = "sheet-back"

    /// iOS 26 は NavigationStack のシステム back をそのまま使う。25 以下は自前に差し替える
    static var usesSystemBack: Bool {
        if #available(iOS 26.0, *) { return true }
        return false
    }

    @ToolbarContentBuilder
    static func close(action: @escaping () -> Void) -> some ToolbarContent {
        if #available(iOS 26.0, *) {
            ToolbarItem(placement: .topBarTrailing) {
                Button(role: .close, action: action)
                    .accessibilityIdentifier(closeIdentifier)
                    .accessibilityLabel("閉じる")
            }
        } else {
            ToolbarItem(placement: .topBarTrailing) {
                Button(action: action) { AtenderLegacyGlyphButtonLabel(symbol: "xmark") }
                    .accessibilityIdentifier(closeIdentifier)
                    .accessibilityLabel("閉じる")
            }
        }
    }

    /// iOS 25 以下用の自前 back (26 では呼ばない)
    static func legacyBack(action: @escaping () -> Void) -> some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            Button(action: action) { AtenderLegacyGlyphButtonLabel(symbol: "chevron.left") }
                .accessibilityIdentifier(backIdentifier)
                .accessibilityLabel("戻る")
        }
    }
}

/// iOS 25 以下の自前丸ボタンのラベル (現行 BottomSheet の ✕ と同寸)
struct AtenderLegacyGlyphButtonLabel: View {
    let symbol: String
    var body: some View {
        Image(systemName: symbol)
            .font(.atenderSm.weight(.bold))
            .foregroundStyle(Color.textPrimary)
            .frame(width: 36, height: 36)
            .background(Color.textPrimary.opacity(0.08), in: Circle())
            .contentShape(Circle())
    }
}
