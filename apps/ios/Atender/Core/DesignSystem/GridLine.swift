import SwiftUI

/// 時間割グリッドと月カレンダーが共有する罫線の単一定義。
/// ★ 太さ・色をここ以外に書かない (「時間割と完全に揃える」= 定義が 1 個であること)
enum AtenderGridLine {
    static let width: CGFloat = 1
    static var color: Color { Color.borderSubtle }   // = .separator (light/dark 両対応)
}
