import AuthenticationServices
import SwiftUI

struct AuthView: View {
    @Environment(AppEnvironment.self) private var environment

    var body: some View {
        AuthViewContent(authStore: environment.authStore)
    }
}

private struct AuthViewContent: View {
    @State private var viewModel: AuthViewModel

    private let appleSignIn: AppleSignIn

    init(authStore: AuthStore) {
        let googleSignIn = GoogleSignIn()
        let appleSignIn = AppleSignIn()
        self.appleSignIn = appleSignIn
        self._viewModel = State(initialValue: AuthViewModel(
            sendMagicLink: { email in
                try await authStore.startMagicLink(email: email)
            },
            signInApple: {
                let token: String
                do {
                    token = try await appleSignIn.signIn()
                } catch {
                    if let authorizationError = error as? ASAuthorizationError,
                       authorizationError.code == .canceled {
                        return
                    }
                    throw error
                }
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
                        kind: .google,
                        title: "Google で続ける",
                        isLoading: viewModel.isGoogleLoading
                    ) {
                        Task { await viewModel.tapGoogle() }
                    }

                    AuthProviderButton(
                        kind: .email,
                        title: "メールで続ける",
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
        AuthProviderButton(
            kind: .apple,
            title: "Appleで続ける",
            isLoading: viewModel.isAppleLoading
        ) {
            Task { await viewModel.tapApple() }
        }
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
                .frame(height: 44)
                .background(Color.bgElevated)
                .overlay {
                    RoundedRectangle(cornerRadius: Radius.sm, style: .continuous)
                        .strokeBorder(Color.borderDefault, lineWidth: 1)
                }
                .clipShape(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))

            AtenderButton(
                title: viewModel.emailPhase == .sent ? "再送する" : "ログインリンクを送る",
                variant: .primary,
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
