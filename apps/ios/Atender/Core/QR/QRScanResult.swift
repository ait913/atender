import Foundation

enum QRScanResult {
    /// payload が atender の招待 URL のときだけ URL を返す。それ以外（非 URL / 他ドメイン / 未知パス / 空）は nil。
    static func deepLink(from payload: String) -> URL? {
        guard let url = URL(string: payload), DeepLink.parse(url) != nil else { return nil }
        return url
    }
}
