import AuthenticationServices
import SwiftUI

struct AuthView: View {
    @Environment(AppEnvironment.self) private var environment

    var body: some View {
        AuthViewContent(authStore: environment.authStore)
    }
}

private struct AuthViewContent: View {
    @Environment(\.colorScheme) private var colorScheme
    @State private var viewModel: AuthViewModel

    private let appleResultBox: AppleResultBox

    init(authStore: AuthStore) {
        let googleSignIn = GoogleSignIn()
        let appleResultBox = AppleResultBox()
        self.appleResultBox = appleResultBox
        self._viewModel = State(initialValue: AuthViewModel(
            sendMagicLink: { email in
                try await authStore.startMagicLink(email: email)
            },
            signInApple: {
                guard let result = appleResultBox.result else {
                    throw APIError.api(status: 400, code: "APPLE_RESULT_MISSING", message: "Apple sign-in result is missing.")
                }
                appleResultBox.result = nil
                let authorization = try result.get()
                let token = try AppleSignIn.identityToken(from: authorization)
                try await authStore.signInWithApple(idToken: token)
            },
            signInGoogle: {
                let url = try await authStore.startGoogleSignIn()
                let callbackURL = try await googleSignIn.start(url: url)
                try authStore.completeTokenSignIn(callbackURL: callbackURL)
                await authStore.refreshMe()
            }
        ))
    }

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            VStack(spacing: Space.s6) {
                logo

                Text("下記のアカウントを使用してログイン")
                    .font(.atenderBase)
                    .foregroundStyle(Color.textSecondary)
                    .multilineTextAlignment(.center)

                VStack(spacing: Space.s3) {
                    appleButton

                    AuthProviderButton(
                        title: "Google で続ける",
                        leadingAssetName: "google-g",
                        fill: .outline,
                        isLoading: viewModel.isGoogleLoading
                    ) {
                        Task { await viewModel.tapGoogle() }
                    }

                    AuthProviderButton(
                        title: "メールで続ける",
                        leadingSystemImage: "envelope.fill",
                        fill: .accent
                    ) {
                        viewModel.openEmail()
                    }

                    if viewModel.emailPhase != .collapsed {
                        emailForm
                    }
                }
            }
            .frame(maxWidth: .infinity)

            Spacer()
        }
        .padding(.horizontal, Space.s6)
        .padding(.vertical, Space.s6)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.bgBase.ignoresSafeArea())
        .alert("サインインできませんでした", isPresented: Binding(
            get: { viewModel.errorMessage != nil },
            set: { isPresented in
                if !isPresented {
                    viewModel.dismissError()
                }
            }
        )) {
            Button("OK") { viewModel.dismissError() }
        } message: {
            Text(viewModel.errorMessage ?? "")
        }
    }

    private var logo: some View {
        VStack(spacing: Space.s3) {
            Image("logo-mark")
                .resizable()
                .scaledToFit()
                .frame(width: Space.s14, height: Space.s14)

            Image("wordmark")
                .resizable()
                .scaledToFit()
                .frame(height: 22)
        }
    }

    private var appleButton: some View {
        SignInWithAppleButton(.continue) { request in
            AppleSignIn.makeRequest(request)
        } onCompletion: { result in
            appleResultBox.result = result
            Task { await viewModel.tapApple() }
        }
        .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
        .frame(height: Space.s12)
        .clipShape(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
        .disabled(viewModel.isAppleLoading)
        .opacity(viewModel.isAppleLoading ? 0.52 : 1)
    }

    private var emailForm: some View {
        VStack(spacing: Space.s3) {
            TextField("メールアドレス", text: $viewModel.email)
                .font(.atenderBase)
                .foregroundStyle(Color.textPrimary)
                .keyboardType(.emailAddress)
                .textContentType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .padding(.horizontal, Space.s4)
                .frame(height: Space.s12)
                .background(Color.bgElevated)
                .overlay {
                    RoundedRectangle(cornerRadius: Radius.sm, style: .continuous)
                        .stroke(Color.borderDefault, lineWidth: 1)
                }
                .clipShape(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))

            AuthProviderButton(
                title: viewModel.emailPhase == .sent ? "再送する" : "ログインリンクを送る",
                fill: .outline,
                isLoading: viewModel.isSendingLink,
                isEnabled: viewModel.canSendLink
            ) {
                Task { await viewModel.sendLink() }
            }

            if viewModel.emailPhase == .sent {
                Text("メールを送信しました。15 分以内にリンクを開いてください")
                    .font(.atenderSm)
                    .foregroundStyle(Color.textSecondary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

@MainActor
private final class AppleResultBox {
    var result: Result<ASAuthorization, Error>?
}
