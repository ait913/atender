import SwiftUI

extension View {
    /// タブ本文の縦 ScrollView の唯一の規格。
    /// - `scrollClipDisabled` は **付けない** (付けるとスクロール中の中身が
    ///   ContextChips / セグメントの上に描かれる = build 13 の実機 FB)
    /// - 代わりに ScrollView を画面幅いっぱいに広げ、インセットを contentMargins で
    ///   中身側に戻す。こうしないとクリップ境界がカードの縁と一致し、カードの影が
    ///   左右だけ切れる (build 14 の実機 FB)
    func atenderPageScroll() -> some View {
        self.scrollBounceBehavior(.basedOnSize)
            .padding(.horizontal, -Space.pagePxMobile)
            .contentMargins(.horizontal, Space.pagePxMobile, for: .scrollContent)
    }
}
