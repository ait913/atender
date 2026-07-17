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
