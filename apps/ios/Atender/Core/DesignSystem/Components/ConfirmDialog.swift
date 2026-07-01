import SwiftUI

extension View {
    func confirmDestructive(
        _ title: String,
        isPresented: Binding<Bool>,
        actionTitle: String,
        action: @escaping () -> Void
    ) -> some View {
        confirmationDialog(title, isPresented: isPresented, titleVisibility: .visible) {
            Button(actionTitle, role: .destructive, action: action)
            Button("キャンセル", role: .cancel) {}
        }
    }
}
