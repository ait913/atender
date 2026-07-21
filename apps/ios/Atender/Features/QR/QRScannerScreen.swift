import SwiftUI
import VisionKit

@MainActor
struct QRScannerScreen: View {
    let onResult: (URL) -> Void
    let onCancel: () -> Void
    @State private var viewState: QRScannerViewState = .checkingPermission
    @State private var handled = false
    @State private var invalidFlash = false

    var body: some View {
        ZStack {
            switch viewState {
            case .checkingPermission:
                ProgressView()
                    .tint(.accent500)
            case .scanning:
                scanningView
            case .permissionDenied:
                unavailableView(
                    systemName: "camera.fill",
                    title: "カメラへのアクセスが必要です",
                    description: "設定でカメラへのアクセスを許可してください。",
                    showsSettings: true
                )
            case .unsupported:
                unavailableView(
                    systemName: "qrcode.viewfinder",
                    title: "この端末では QR スキャンを利用できません",
                    description: "招待リンクまたはコードで参加してください",
                    showsSettings: false
                )
            }
        }
        .background(Color.black.ignoresSafeArea())
        .task {
            viewState = QRScannerStateLogic.resolve(isSupported: DataScannerViewController.isSupported, permission: CameraPermission.status)
            if viewState == .checkingPermission {
                _ = await CameraPermission.request()
                viewState = QRScannerStateLogic.resolve(isSupported: DataScannerViewController.isSupported, permission: CameraPermission.status)
            }
        }
    }

    private var scanningView: some View {
        ZStack {
            DataScannerView { payload in
                handleScan(payload)
            }
            .ignoresSafeArea()

            VStack {
                HStack {
                    Button {
                        onCancel()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.atenderSm)
                            .fontWeight(.bold)
                            .foregroundStyle(Color.white)
                            .frame(width: 44, height: 44)
                            .background(Color.black.opacity(0.45))
                            .clipShape(Circle())
                    }
                    Spacer()
                }
                .padding(Space.s5)

                Spacer()

                VStack(spacing: Space.s3) {
                    if invalidFlash {
                        Text("無効な QR コードです")
                            .font(.atenderSm)
                            .fontWeight(.semibold)
                            .foregroundStyle(Color.white)
                            .padding(.horizontal, Space.s4)
                            .padding(.vertical, Space.s2)
                            .background(Color.statusAbsent.opacity(0.92))
                            .clipShape(Capsule())
                    }

                    Text("QR コードを枠内に収めてください")
                        .font(.atenderSm)
                        .fontWeight(.semibold)
                        .foregroundStyle(Color.white)
                        .padding(.horizontal, Space.s4)
                        .padding(.vertical, Space.s2)
                        .background(Color.black.opacity(0.45))
                        .clipShape(Capsule())
                }
                .padding(.bottom, Space.s8)
            }
        }
    }

    private func unavailableView(systemName: String, title: String, description: String, showsSettings: Bool) -> some View {
        ContentUnavailableView {
            Label(title, systemImage: systemName)
        } description: {
            Text(description)
        } actions: {
            VStack(spacing: Space.s3) {
                if showsSettings {
                    Button("設定を開く") {
                        if let url = URL(string: UIApplication.openSettingsURLString) {
                            UIApplication.shared.open(url)
                        }
                    }
                    .buttonStyle(.borderedProminent)
                }
                Button("閉じる") {
                    onCancel()
                }
                .buttonStyle(.bordered)
            }
        }
    }

    private func handleScan(_ payload: String) {
        guard !handled else { return }
        guard let url = QRScanResult.deepLink(from: payload) else {
            flashInvalid()
            return
        }
        handled = true
        onResult(url)
    }

    private func flashInvalid() {
        invalidFlash = true
        Task {
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            invalidFlash = false
        }
    }
}
