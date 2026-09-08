import SwiftUI

enum ModalHeader {
    /// ★ 全モーダル共通のタイトル書体 (DESIGN.md §3.7.4)
    static var titleFont: Font { .atender2xl.weight(.bold) }
    static let titleMinimumScaleFactor: CGFloat = 0.5
}

private struct ModalHeaderModifier: ViewModifier {
    let title: String?
    let showsBack: Bool
    let onBack: (() -> Void)?
    let onClose: () -> Void

    func body(content: Content) -> some View {
        content
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .navigationBarBackButtonHidden(showsBack && !AtenderModalToolbar.usesSystemBack)
            .toolbar {
                legacyBackItem
                titleItem
                AtenderModalToolbar.close(action: onClose)
            }
    }

    @ToolbarContentBuilder
    private var legacyBackItem: some ToolbarContent {
        if showsBack, !AtenderModalToolbar.usesSystemBack, let onBack {
            AtenderModalToolbar.legacyBack(action: onBack)
        }
    }

    @ToolbarContentBuilder
    private var titleItem: some ToolbarContent {
        if let title {
            ToolbarItem(placement: .principal) {
                Text(title)
                    .font(ModalHeader.titleFont)
                    .foregroundStyle(Color.textPrimary)
                    .lineLimit(1)
                    .minimumScaleFactor(ModalHeader.titleMinimumScaleFactor)
                    .accessibilityAddTraits(.isHeader)
            }
        }
    }
}

extension View {
    /// モーダルの 1 段目 (タイトル + 閉じる)
    func atenderModalHeader(title: String?, onClose: @escaping () -> Void) -> some View {
        modifier(ModalHeaderModifier(title: title, showsBack: false, onBack: nil, onClose: onClose))
    }
    /// モーダル内で push した 2 段目 (戻る + タイトル + 閉じる)
    func atenderModalDetailHeader(title: String?, onBack: @escaping () -> Void, onClose: @escaping () -> Void) -> some View {
        modifier(ModalHeaderModifier(title: title, showsBack: true, onBack: onBack, onClose: onClose))
    }
}
