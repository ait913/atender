import SwiftUI

struct BottomSheet<Content: View, Footer: View>: View {
    let title: String?
    @Binding var isPresented: Bool
    var navigationPath: Binding<NavigationPath>? = nil
    var detents: Set<PresentationDetent> = [.medium, .large]
    var stackLevel: Int = 1
    var onDismiss: (() -> Void)?
    @ViewBuilder var content: () -> Content
    @ViewBuilder var footer: () -> Footer
    @State private var sheetPresented = false
    @State private var ownPath = NavigationPath()
    @State private var contentHeight: CGFloat = 0
    @State private var footerHeight: CGFloat = 0
    @State private var chromeHeight: CGFloat = 0
    /// シートを開き直した最初の実測で前回値を捨てるためのフラグ (単調 max が張り付くのを防ぐ)
    @State private var needsChromeRemeasure = true

    private var fittedDetents: Set<PresentationDetent> {
        guard let height = BottomSheetDetent.fittedHeight(
            chrome: chromeHeight, content: contentHeight, footer: footerHeight,
            screenHeight: UIScreen.main.bounds.height,
            isPushed: !(navigationPath?.wrappedValue.isEmpty ?? true)
        ) else { return detents }
        return [.height(height)]
    }

    var body: some View {
        Color.clear
            .frame(width: 0, height: 0)
            .sheet(isPresented: $sheetPresented, onDismiss: dismissBinding) {
                sheetChrome()
                    .presentationDetents(fittedDetents)
                    .presentationDragIndicator(.hidden)
                    .presentationBackground(Color.bgElevated)
            }
            .onAppear {
                guard isPresented else { return }
                Task { @MainActor in
                    sheetPresented = true
                }
            }
            .onChange(of: isPresented) { _, newValue in
                if newValue { needsChromeRemeasure = true }
                sheetPresented = newValue
            }
    }

    /// chrome (grabber + nav bar) の実測を取り込む。
    /// - 0 / 非有限は無視する (transient な 0 報告で detent を縮退させない)
    /// - 開き直した後の 1 回目は前回値を上書きする (前回の max が張り付くのを防ぐ)
    /// - 2 回目以降は max で溜める (レイアウト収束とスクロールによる minY 減少への保護)
    private func applyChromeMeasurement(_ raw: CGFloat) {
        let measured = BottomSheetDetent.clampChrome(raw)
        guard measured > 0 else { return }
        if needsChromeRemeasure {
            needsChromeRemeasure = false
            chromeHeight = measured
        } else {
            chromeHeight = max(chromeHeight, measured)
        }
    }

    private func dismiss() {
        sheetPresented = false
    }

    private func dismissBinding() {
        needsChromeRemeasure = true
        isPresented = false
        onDismiss?()
    }

    private func sheetChrome() -> some View {
        VStack(spacing: 0) {
            Capsule()
                .fill(Color.borderEmphasis)
                .frame(width: 42, height: 5)
                .padding(.top, Space.s2)
                .padding(.bottom, Space.s3)
            NavigationStack(path: navigationPath ?? $ownPath) {
                VStack(spacing: 0) {
                    ScrollView {
                        content()
                            .padding(.horizontal, Space.s5)
                            .padding(.bottom, Space.s5)
                            .background(
                                GeometryReader { proxy in
                                    Color.clear
                                        .preference(key: SheetContentHeightKey.self, value: proxy.size.height)
                                        .preference(
                                            key: SheetChromeHeightKey.self,
                                            value: proxy.frame(in: .named(BottomSheetSpace.name)).minY
                                        )
                                }
                            )
                    }
                    .scrollBounceBehavior(.basedOnSize)
                    footer()
                        .padding(Space.s5)
                        .background(Color.bgElevated)
                        .background(GeometryReader { proxy in
                            Color.clear.preference(key: SheetFooterHeightKey.self, value: proxy.size.height)
                        })
                }
                .background(Color.bgElevated)
                .atenderModalHeader(title: title, onClose: dismiss)
            }
        }
        .background(Color.bgElevated)
        .coordinateSpace(.named(BottomSheetSpace.name))
        .onPreferenceChange(SheetContentHeightKey.self) { contentHeight = $0 }
        .onPreferenceChange(SheetFooterHeightKey.self) { footerHeight = $0 }
        .onPreferenceChange(SheetChromeHeightKey.self) { applyChromeMeasurement($0) }
    }

    init(
        title: String?,
        isPresented: Binding<Bool>,
        navigationPath: Binding<NavigationPath>? = nil,
        detents: Set<PresentationDetent> = [.medium, .large],
        stackLevel: Int = 1,
        onDismiss: (() -> Void)? = nil,
        @ViewBuilder content: @escaping () -> Content,
        @ViewBuilder footer: @escaping () -> Footer
    ) {
        self.title = title
        self._isPresented = isPresented
        self.navigationPath = navigationPath
        self.detents = detents
        self.stackLevel = stackLevel
        self.onDismiss = onDismiss
        self.content = content
        self.footer = footer
    }
}

extension BottomSheet where Footer == EmptyView {
    init(
        title: String?,
        isPresented: Binding<Bool>,
        navigationPath: Binding<NavigationPath>? = nil,
        detents: Set<PresentationDetent> = [.medium, .large],
        stackLevel: Int = 1,
        onDismiss: (() -> Void)? = nil,
        @ViewBuilder content: @escaping () -> Content
    ) {
        self.title = title
        self._isPresented = isPresented
        self.navigationPath = navigationPath
        self.detents = detents
        self.stackLevel = stackLevel
        self.onDismiss = onDismiss
        self.content = content
        self.footer = { EmptyView() }
    }
}
