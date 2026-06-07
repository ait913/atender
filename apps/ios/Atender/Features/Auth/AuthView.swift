import AuthenticationServices
import SwiftUI

struct AuthView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var isGoogleLoading = false
    @State private var isAppleLoading = false
    @State private var alertMessage: String?
    private let googleSignIn = GoogleSignIn()

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s6) {
            Spacer()

            VStack(alignment: .leading, spacing: Space.s3) {
                Text("Atender")
                    .font(.atender5xl.weight(.black))
                    .foregroundStyle(Color.textPrimary)
                Text("Based in Tokyo / Chiba. 今日の授業と出席を、iPhone からすばやく。")
                    .font(.atenderLg)
                    .foregroundStyle(Color.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            VStack(spacing: Space.s3) {
                AtenderButton(title: "Google で続ける", systemImage: "globe", isLoading: isGoogleLoading) {
                    signInWithGoogle()
                }

                SignInWithAppleButton(.continue) { request in
                    AppleSignIn.makeRequest(request)
                } onCompletion: { result in
                    signInWithApple(result)
                }
                .signInWithAppleButtonStyle(.white)
                .frame(height: 48)
                .clipShape(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
                .disabled(isAppleLoading)
            }

            Spacer()
        }
        .padding(Space.s6)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .background(Color.bgBase.ignoresSafeArea())
        .alert("サインインできませんでした", isPresented: .constant(alertMessage != nil)) {
            Button("OK") { alertMessage = nil }
        } message: {
            Text(alertMessage ?? "")
        }
    }

    private func signInWithGoogle() {
        Task {
            isGoogleLoading = true
            defer { isGoogleLoading = false }
            do {
                let url = try await environment.authStore.startGoogleSignIn()
                let callbackURL = try await googleSignIn.start(url: url)
                try environment.authStore.completeGoogleSignIn(callbackURL: callbackURL)
                await environment.authStore.refreshMe()
            } catch {
                alertMessage = error.userFacingMessage
            }
        }
    }

    private func signInWithApple(_ result: Result<ASAuthorization, Error>) {
        Task {
            isAppleLoading = true
            defer { isAppleLoading = false }
            do {
                let authorization = try result.get()
                let token = try AppleSignIn.identityToken(from: authorization)
                try await environment.authStore.signInWithApple(idToken: token)
            } catch {
                alertMessage = error.userFacingMessage
            }
        }
    }
}
