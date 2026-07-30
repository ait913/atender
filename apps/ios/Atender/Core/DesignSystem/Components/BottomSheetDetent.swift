import SwiftUI

enum BottomSheetSpace { static let name = "atender.bottomSheet.root" }

struct SheetContentHeightKey: PreferenceKey {
    static var defaultValue: CGFloat { 0 }
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = max(value, nextValue()) }
}

struct SheetFooterHeightKey: PreferenceKey {
    static var defaultValue: CGFloat { 0 }
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = max(value, nextValue()) }
}

/// ★ 旧 SheetHeaderHeightKey を置換。値は「シート最上端からコンテンツ上端までの距離」
struct SheetChromeHeightKey: PreferenceKey {
    static var defaultValue: CGFloat { 0 }
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = max(value, nextValue()) }
}

enum BottomSheetDetent {
    static let minHeight: CGFloat = 180
    static let maxScreenRatio: CGFloat = 0.92
    static let bottomInset: CGFloat = 8
    /// chrome 実測の上限 (grabber 25pt + nav bar 44pt ≈ 69pt。Dynamic Type 拡大の余裕を見て 160 で頭打ち)
    static let maxChromeHeight: CGFloat = 160

    /// 実測値の健全化。非有限・非正は 0 (= 未測定) に、過大は上限に丸める
    static func clampChrome(_ raw: CGFloat) -> CGFloat {
        guard raw.isFinite, raw > 0 else { return 0 }
        return min(raw, maxChromeHeight)
    }

    /// 返り値 nil = 未測定 (呼び出し側 detents にフォールバック)
    /// isPushed = true (editor を push 中) は中身を実測できないので画面比の上限を返す
    static func fittedHeight(chrome: CGFloat, content: CGFloat, footer: CGFloat,
                             screenHeight: CGFloat, isPushed: Bool) -> CGFloat? {
        guard screenHeight > 0 else { return nil }
        let ceiling = screenHeight * maxScreenRatio
        if isPushed { return ceiling }
        guard chrome > 0, content > 0 else { return nil }
        return min(max(chrome + content + footer + bottomInset, minHeight), ceiling)
    }
}
