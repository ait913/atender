import XCTest
@testable import Atender

// Reviewer 生成: 本テストは設計仕様の AuthViewModel (状態機械) と F1-F9 のみを根拠にする。
// 対象 public API:
// init(sendMagicLink:signInApple:signInGoogle:cooldownSeconds:) / email / emailPhase /
// isAppleLoading / isGoogleLoading / isSendingLink / cooldownActive / errorMessage /
// canSendLink / openEmail() / tapApple() / tapGoogle() / sendLink() / dismissError()。

@MainActor
final class AuthViewModelTests: XCTestCase {
    private enum StubError: Error {
        case failure
    }

    private func makeViewModel(
        sendMagicLink: @escaping (_ email: String) async throws -> Void = { _ in },
        signInApple: @escaping () async throws -> Void = {},
        signInGoogle: @escaping () async throws -> Void = {},
        cooldownSeconds: Double = 60
    ) -> AuthViewModel {
        AuthViewModel(
            sendMagicLink: sendMagicLink,
            signInApple: signInApple,
            signInGoogle: signInGoogle,
            cooldownSeconds: cooldownSeconds
        )
    }

    func testInitialStateIsCollapsedAndIdle() {
        let vm = makeViewModel()

        XCTAssertEqual(vm.emailPhase, .collapsed, "F1: 初期 emailPhase は collapsed")
        XCTAssertFalse(vm.isAppleLoading, "F1: 初期 Apple loading は false")
        XCTAssertFalse(vm.isGoogleLoading, "F1: 初期 Google loading は false")
        XCTAssertFalse(vm.isSendingLink, "F1: 初期 Magic Link 送信中は false")
        XCTAssertFalse(vm.cooldownActive, "F1: 初期 cooldown は false")
        XCTAssertNil(vm.errorMessage, "F1: 初期 errorMessage は nil")
    }

    func testOpenEmailMovesToEditing() {
        let vm = makeViewModel()

        vm.openEmail()

        XCTAssertEqual(vm.emailPhase, .editing, "F2: openEmail() で editing に遷移")
    }

    func testCanSendLinkReflectsEmailSendingAndCooldownState() async throws {
        var vm: AuthViewModel!
        vm = makeViewModel(
            sendMagicLink: { _ in
                XCTAssertFalse(vm.canSendLink, "F3: isSendingLink 中は canSendLink false")
            },
            cooldownSeconds: 0.05
        )

        XCTAssertFalse(vm.canSendLink, "F3: email 空なら canSendLink false")

        vm.email = "student@example.com"
        XCTAssertTrue(vm.canSendLink, "F3: email 有 & 非送信中 & 非 cooldown なら canSendLink true")

        await vm.sendLink()

        XCTAssertFalse(vm.canSendLink, "F3: cooldownActive 中は canSendLink false")
        try await Task.sleep(for: .seconds(0.2))
        XCTAssertTrue(vm.canSendLink, "F3: cooldown 終了後は再び canSendLink true")
    }

    func testSendLinkSuccessMovesToSentStartsCooldownAndClearsCooldownLater() async throws {
        var sentEmails: [String] = []
        let vm = makeViewModel(
            sendMagicLink: { email in
                sentEmails.append(email)
            },
            cooldownSeconds: 0.05
        )
        vm.email = "student@example.com"

        await vm.sendLink()

        XCTAssertEqual(sentEmails, ["student@example.com"])
        XCTAssertEqual(vm.emailPhase, .sent, "F4: 成功時は sent に遷移")
        XCTAssertTrue(vm.cooldownActive, "F4: 成功時は cooldownActive true")
        XCTAssertNil(vm.errorMessage, "F4: 成功時は errorMessage nil")

        try await Task.sleep(for: .seconds(0.2))
        XCTAssertFalse(vm.cooldownActive, "F4: cooldownSeconds 経過後 cooldownActive false")
    }

    func testSendLinkFailureSetsErrorWithoutSentOrCooldown() async {
        let vm = makeViewModel(
            sendMagicLink: { _ in throw StubError.failure },
            cooldownSeconds: 0.05
        )
        vm.email = "student@example.com"

        await vm.sendLink()

        XCTAssertNotNil(vm.errorMessage, "F5: 失敗時は errorMessage が立つ")
        XCTAssertNotEqual(vm.emailPhase, .sent, "F5: 失敗時は sent にならない")
        XCTAssertFalse(vm.cooldownActive, "F5: 失敗時は cooldown を開始しない")
    }

    func testSendLinkNoOpsWhenCanSendLinkIsFalse() async {
        var callCount = 0
        let vm = makeViewModel(
            sendMagicLink: { _ in
                callCount += 1
            }
        )
        vm.email = ""

        await vm.sendLink()

        XCTAssertEqual(callCount, 0, "F6: canSendLink false なら sendMagicLink は呼ばれない")
    }

    func testTapAppleSuccessAndFailureFinalStates() async {
        let successVM = makeViewModel(signInApple: {})

        await successVM.tapApple()

        XCTAssertFalse(successVM.isAppleLoading, "F7: Apple 成功完了後 loading false")
        XCTAssertNil(successVM.errorMessage, "F7: Apple 成功時 errorMessage nil")

        let failureVM = makeViewModel(signInApple: { throw StubError.failure })

        await failureVM.tapApple()

        XCTAssertFalse(failureVM.isAppleLoading, "F7: Apple 失敗完了後 loading false")
        XCTAssertNotNil(failureVM.errorMessage, "F7: Apple 失敗時 errorMessage が立つ")
    }

    func testTapGoogleSuccessAndFailureFinalStates() async {
        let successVM = makeViewModel(signInGoogle: {})

        await successVM.tapGoogle()

        XCTAssertFalse(successVM.isGoogleLoading, "F8: Google 成功完了後 loading false")
        XCTAssertNil(successVM.errorMessage, "F8: Google 成功時 errorMessage nil")

        let failureVM = makeViewModel(signInGoogle: { throw StubError.failure })

        await failureVM.tapGoogle()

        XCTAssertFalse(failureVM.isGoogleLoading, "F8: Google 失敗完了後 loading false")
        XCTAssertNotNil(failureVM.errorMessage, "F8: Google 失敗時 errorMessage が立つ")
    }

    func testDismissErrorClearsErrorMessage() async {
        let vm = makeViewModel(signInApple: { throw StubError.failure })

        await vm.tapApple()
        XCTAssertNotNil(vm.errorMessage, "F9: 事前条件として errorMessage を立てる")

        vm.dismissError()

        XCTAssertNil(vm.errorMessage, "F9: dismissError() で errorMessage nil")
    }
}
