import SwiftUI

struct BottomTabBar: View {
    let selected: MainTab
    let onSelect: (MainTab) -> Void

    var body: some View {
        HStack(spacing: 0) {
            ForEach(MainTab.allCases, id: \.self) { tab in
                Button {
                    onSelect(tab)
                } label: {
                    VStack(spacing: Space.s1) {
                        ZStack {
                            if selected == tab {
                                RoundedRectangle(cornerRadius: Radius.sm, style: .continuous)
                                    .fill(Color.accent500)
                                    .frame(width: 40, height: 40)
                                    .atenderShadow(.glow)
                            }
                            Image(systemName: tab.symbol)
                                .font(.system(size: 19, weight: .bold))
                                .foregroundStyle(selected == tab ? Color.textOnAccent : Color.textTertiary)
                                .frame(width: 40, height: 40)
                                .scaleEffect(selected == tab ? 1.05 : 1)
                        }
                        Text(tab.label)
                            .font(.atenderXs)
                            .fontWeight(.bold)
                            .foregroundStyle(selected == tab ? Color.accent500 : Color.textTertiary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.72)
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: Space.tabBarContent)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, Space.s2)
        .padding(.top, Space.s2)
        .padding(.bottom, safeAreaBottom())
        .frame(maxWidth: .infinity)
        .frame(minHeight: Space.tabBarHeight)
        .background(.ultraThinMaterial)
        .background(Color.bgElevated.opacity(0.85))
        .overlay(alignment: .top) {
            Rectangle().fill(Color.borderSubtle).frame(height: 1)
        }
    }

    private func safeAreaBottom() -> CGFloat {
        UIApplication.shared.connectedScenes
            .compactMap { ($0 as? UIWindowScene)?.keyWindow?.safeAreaInsets.bottom }
            .first ?? 0
    }
}
