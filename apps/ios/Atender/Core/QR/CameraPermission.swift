import AVFoundation

enum CameraPermission {
    static var status: AVAuthorizationStatus { AVCaptureDevice.authorizationStatus(for: .video) }

    /// .notDetermined のときシステムダイアログを出す。戻り値 = 許可されたか。
    static func request() async -> Bool { await AVCaptureDevice.requestAccess(for: .video) }
}
