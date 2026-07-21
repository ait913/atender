import SwiftUI

/// アプリ標準のテキスト入力スタイル。`.textFieldStyle(.atender)` で使う。
/// iOS デフォルトの `.roundedBorder` (細い枠線) をやめ、塗り + 角丸のアプリ意匠に統一する。
/// LabeledInput の見た目と一致 (bgMuted 塗り / Radius.md / padding s3)。
struct AtenderTextFieldStyle: TextFieldStyle {
    func _body(configuration: TextField<Self._Label>) -> some View {
        configuration
            .font(.atenderBase)
            .foregroundStyle(Color.textPrimary)
            .padding(Space.s3)
            .background(Color.bgMuted)
            .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
    }
}

extension TextFieldStyle where Self == AtenderTextFieldStyle {
    static var atender: AtenderTextFieldStyle { AtenderTextFieldStyle() }
}
