import CoreImage
import CoreImage.CIFilterBuiltins
import UIKit

enum QRCodeGenerator {
    /// 空文字列 or 生成失敗時は nil。成功時は正方形の UIImage (CIFilter 生の解像度、拡大は表示側で .interpolation(.none))。
    static func image(from string: String) -> UIImage? {
        guard !string.isEmpty else { return nil }

        let f = CIFilter.qrCodeGenerator()
        f.message = Data(string.utf8)
        f.correctionLevel = "M"

        guard let out = f.outputImage,
              let cg = CIContext().createCGImage(out, from: out.extent) else {
            return nil
        }

        return UIImage(cgImage: cg)
    }
}
