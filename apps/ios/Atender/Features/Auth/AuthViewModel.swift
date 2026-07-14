import Foundation
import Observation

@MainActor
@Observable
final class AuthViewModel {
    enum EmailPhase: Equatable {
        case collapsed
        case editing
        case sent
    }

    var email: String = ""
    private(set) var emailPhase: EmailPhase = .collapsed
    private(set) var isAppleLoading = false
    private(set) var isGoogleLoading = false
    private(set) var isSendingLink = false
    private(set) var cooldownActive = false
    private(set) var errorMessage: String?

    private let sendMagicLink: (_ email: String) async throws -> Void
    private let signInApple: () async throws -> Void
    private let signInGoogle: () async throws -> Void
    private let cooldownSeconds: Double

    init(
        sendMagicLink: @escaping (_ email: String) async throws -> Void,
        signInApple: @escaping () async throws -> Void,
        signInGoogle: @escaping () async throws -> Void,
        cooldownSeconds: Double = 60
    ) {
        self.sendMagicLink = sendMagicLink
        self.signInApple = signInApple
        self.signInGoogle = signInGoogle
        self.cooldownSeconds = cooldownSeconds
    }

    var canSendLink: Bool {
        !email.isEmpty && !isSendingLink && !cooldownActive
    }

    func openEmail() {
        if emailPhase == .collapsed {
            emailPhase = .editing
        }
    }

    func tapApple() async {
        guard !isAppleLoading else { return }
        isAppleLoading = true
        errorMessage = nil
        defer { isAppleLoading = false }
        do {
            try await signInApple()
        } catch {
            errorMessage = error.userFacingMessage
        }
    }

    func tapGoogle() async {
        guard !isGoogleLoading else { return }
        isGoogleLoading = true
        errorMessage = nil
        defer { isGoogleLoading = false }
        do {
            try await signInGoogle()
        } catch {
            errorMessage = error.userFacingMessage
        }
    }

    func sendLink() async {
        guard canSendLink else { return }
        isSendingLink = true
        errorMessage = nil
        defer { isSendingLink = false }
        do {
            try await sendMagicLink(email)
            emailPhase = .sent
            cooldownActive = true
            Task { [cooldownSeconds] in
                try? await Task.sleep(for: .seconds(cooldownSeconds))
                cooldownActive = false
            }
        } catch {
            errorMessage = error.userFacingMessage
        }
    }

    func dismissError() {
        errorMessage = nil
    }
}
