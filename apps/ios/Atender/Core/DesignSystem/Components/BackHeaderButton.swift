import SwiftUI

/// push 遷移画面のカスタム戻るボタン。iOS デフォルトの英語 "‹ Back" を使わず、
/// アプリのデザイン言語 (チップ状 + 日本語 + textPrimary) に揃える。
/// nav bar は各画面側で `.toolbar(.hidden, for: .navigationBar)` により非表示にした上で使う。
struct BackHeaderButton: View {
    var label: String = "戻る"
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: Space.s1) {
                Image(systemName: "chevron.left")
                    .font(.atenderSm)
                    .fontWeight(.bold)
                Text(label)
                    .font(.atenderSm)
                    .fontWeight(.bold)
            }
            .foregroundStyle(Color.textPrimary)
            .padding(.leading, Space.s2)
            .padding(.trailing, Space.s3)
            .frame(height: 40)
            .background(Color.textPrimary.opacity(0.06))
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("back-header-button")
    }
}
