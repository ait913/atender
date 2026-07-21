import AVFoundation

enum QRScannerViewState: Equatable {
    case checkingPermission
    case scanning
    case permissionDenied
    case unsupported
}

enum QRScannerStateLogic {
    static func resolve(isSupported: Bool, permission: AVAuthorizationStatus) -> QRScannerViewState {
        if !isSupported {
            return .unsupported
        }
        if permission == .authorized {
            return .scanning
        }
        if permission == .denied || permission == .restricted {
            return .permissionDenied
        }
        return .checkingPermission
    }
}
