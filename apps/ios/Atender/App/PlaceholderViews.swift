import SwiftUI

struct HomePlaceholderView: View {
    var body: some View { HomeView() }
}

struct SemesterPlaceholderView: View {
    var body: some View { SemesterOverviewView() }
}

struct RoomsPlaceholderView: View {
    var body: some View { PlaceholderScreen(title: "ルーム", subtitle: "準備中") }
}

struct FriendsPlaceholderView: View {
    var body: some View { PlaceholderScreen(title: "友達", subtitle: "準備中") }
}

private struct PlaceholderScreen: View {
    let title: String
    let subtitle: String

    var body: some View {
        VStack(spacing: 0) {
            TopBar(title: title)
            VStack(spacing: Space.s3) {
                Text(title)
                    .font(.atender2xl)
                    .fontWeight(.bold)
                    .foregroundStyle(Color.textPrimary)
                Text(subtitle)
                    .font(.atenderBase)
                    .foregroundStyle(Color.textSecondary)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .padding(.bottom, Space.tabBarHeight)
        }
        .background(Color.clear)
        .navigationBarHidden(true)
    }
}

private struct TopBar: View {
    let title: String

    var body: some View {
        Text(title)
            .font(.atenderBase)
            .fontWeight(.bold)
            .foregroundStyle(Color.textPrimary)
            .frame(maxWidth: .infinity)
            .frame(height: Space.topbarHeightMobile)
            .background(.ultraThinMaterial)
            .background(Color.bgBase.opacity(0.70))
            .overlay(alignment: .bottom) {
                Rectangle().fill(Color.borderSubtle).frame(height: 1)
            }
    }
}
