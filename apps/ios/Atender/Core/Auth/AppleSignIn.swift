import AuthenticationServices
import Foundation
import UIKit

struct AppleSignInCredential: Equatable, Sendable {
    let identityToken: String
    /// ASAuthorizationAppleIDCredential.authorizationCode を UTF-8 で。無い / 空 / UTF-8 でない → nil
    let authorizationCode: String?
}

@MainActor
final class AppleSignIn: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    private var continuation: CheckedContinuation<AppleSignInCredential, Error>?

    nonisolated static func makeRequest(_ request: ASAuthorizationAppleIDRequest) {
        request.requestedScopes = [.fullName, .email]
    }

    nonisolated static func identityToken(from authorization: ASAuthorization) throws -> String {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let data = credential.identityToken,
              let token = String(data: data, encoding: .utf8) else {
            throw APIError.api(status: 400, code: "APPLE_ID_TOKEN_MISSING", message: "Apple identity token is missing.")
        }
        return token
    }

    /// nil → nil / 空 Data → nil / UTF-8 として不正 → nil / それ以外は UTF-8 文字列 (空文字なら nil)
    nonisolated static func authorizationCodeString(from data: Data?) -> String? {
        guard let data, !data.isEmpty, let code = String(data: data, encoding: .utf8), !code.isEmpty else { return nil }
        return code
    }

    func signIn() async throws -> AppleSignInCredential {
        try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            let request = ASAuthorizationAppleIDProvider().createRequest()
            request.requestedScopes = [.fullName, .email]
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
        }
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        do {
            let identityToken = try Self.identityToken(from: authorization)
            let code = Self.authorizationCodeString(from: (authorization.credential as? ASAuthorizationAppleIDCredential)?.authorizationCode)
            continuation?.resume(returning: AppleSignInCredential(identityToken: identityToken, authorizationCode: code))
        } catch {
            continuation?.resume(throwing: error)
        }
        continuation = nil
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        continuation?.resume(throwing: error)
        continuation = nil
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first { $0.isKeyWindow } ?? ASPresentationAnchor()
    }
}
