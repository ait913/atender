import Foundation
import GoogleSignIn
import UIKit

@MainActor
final class GoogleSignIn {
    func signIn() async throws -> String {
        guard let presentingVC = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .flatMap(\.windows)
            .first(where: { $0.isKeyWindow })?
            .rootViewController else {
            throw APIError.transport("Google sign-in presentation view controller is missing.")
        }

        if GIDSignIn.sharedInstance.configuration == nil {
            guard let clientID = Bundle.main.object(forInfoDictionaryKey: "GIDClientID") as? String,
                  !clientID.isEmpty else {
                throw APIError.api(status: 400, code: "GOOGLE_CLIENT_ID_MISSING", message: "Google iOS client ID is missing.")
            }
            GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID)
        }

        let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: presentingVC)
        guard let idToken = result.user.idToken?.tokenString, !idToken.isEmpty else {
            throw APIError.api(status: 400, code: "GOOGLE_ID_TOKEN_MISSING", message: "Google id_token is missing.")
        }
        return idToken
    }
}
