import SwiftUI
import UIKit

@MainActor
struct InviteQRView: View {
    let urlString: String
    @State private var image: UIImage?

    var body: some View {
        VStack {
            if let image {
                Image(uiImage: image)
                    .interpolation(.none)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 200, height: 200)
            } else {
                RoundedRectangle(cornerRadius: Radius.sm, style: .continuous)
                    .fill(Color.bgMuted)
                    .frame(width: 200, height: 200)
                    .redacted(reason: .placeholder)
            }
        }
        .padding(Space.s4)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
        .atenderShadow(.card)
        .frame(maxWidth: .infinity)
        .task(id: urlString) {
            image = QRCodeGenerator.image(from: urlString)
        }
    }
}
