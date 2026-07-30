import CoreGraphics
import UIKit
import XCTest
@testable import Atender

final class MascotAlphaTests: XCTestCase {
    private struct MascotFile {
        let name: String
        let relativePath: String
        let expectedSide: Int
    }

    private struct HoleStats {
        let count: Int
        let total: Int
        let max: Int

        var largeHoleCount: Int { largeAreas.count }
        let largeAreas: [Int]
    }

    private let mascotFiles: [MascotFile] = [
        MascotFile(
            name: "ios mascot-hello-1024",
            relativePath: "apps/ios/Atender/Assets.xcassets/mascot-hello.imageset/mascot-hello-1024.png",
            expectedSide: 1024
        ),
        MascotFile(
            name: "web mascot-hello-1024",
            relativePath: "apps/web/public/character/mascot-hello-1024.png",
            expectedSide: 1024
        ),
        MascotFile(name: "mascot-chat", relativePath: "apps/web/public/character/mascot-chat.png", expectedSide: 403),
        MascotFile(name: "mascot-run", relativePath: "apps/web/public/character/mascot-run.png", expectedSide: 355),
        MascotFile(name: "mascot-laptop", relativePath: "apps/web/public/character/mascot-laptop.png", expectedSide: 313),
        MascotFile(name: "mascot-idea", relativePath: "apps/web/public/character/mascot-idea.png", expectedSide: 406),
    ]

    private var repoRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    func testA1NoLargeHoles() throws {
        for file in mascotFiles {
            let image = try loadImage(file)
            let alpha = try alphaPlane(from: image.cgImage, fileName: file.name)
            let stats = holeStats(alpha: alpha.bytes, width: alpha.width, height: alpha.height)

            XCTAssertEqual(
                stats.largeHoleCount,
                0,
                "\(file.name) has \(stats.largeHoleCount) holes >= 64px; max=\(stats.max), total=\(stats.total)"
            )
        }
    }

    func testA2HoleAreaIsBelowPointTwoPercent() throws {
        for file in mascotFiles {
            let image = try loadImage(file)
            let alpha = try alphaPlane(from: image.cgImage, fileName: file.name)
            let stats = holeStats(alpha: alpha.bytes, width: alpha.width, height: alpha.height)
            let area = alpha.width * alpha.height
            let ratio = Double(stats.total) / Double(area)

            XCTAssertLessThanOrEqual(
                ratio,
                0.002,
                "\(file.name) hole area ratio \(ratio) exceeds 0.2%; total=\(stats.total), area=\(area)"
            )
        }
    }

    func testA3NegativeControlDetectsInjectedTransparentCircle() throws {
        for file in mascotFiles {
            let image = try loadImage(file)
            let alpha = try alphaPlane(from: image.cgImage, fileName: file.name)
            var damaged = alpha.bytes
            let center = try opaqueDiskCenterNearImageCenter(alpha: damaged, width: alpha.width, height: alpha.height, radius: 20, fileName: file.name)
            punchTransparentCircle(alpha: &damaged, width: alpha.width, height: alpha.height, center: center, radius: 20)

            let stats = holeStats(alpha: damaged, width: alpha.width, height: alpha.height)

            XCTAssertGreaterThanOrEqual(
                stats.largeHoleCount,
                1,
                "\(file.name) negative control did not detect injected transparent circle at \(center); max=\(stats.max), total=\(stats.total)"
            )
        }
    }

    func testA4MascotDimensionsMatchCurrentAssets() throws {
        for file in mascotFiles {
            let image = try loadImage(file)
            let width = Int(image.size.width)
            let height = Int(image.size.height)

            XCTAssertEqual(width, file.expectedSide, "\(file.name) width is \(width), expected \(file.expectedSide)")
            XCTAssertEqual(height, file.expectedSide, "\(file.name) height is \(height), expected \(file.expectedSide)")
        }
    }

    func testA5MascotHelloAssetResolves() {
        XCTAssertNotNil(UIImage(named: "mascot-hello"), "UIImage(named: \"mascot-hello\") must resolve from the asset catalog")
    }

    private func loadImage(_ file: MascotFile) throws -> UIImage {
        let url = repoRoot.appendingPathComponent(file.relativePath)
        let image = UIImage(contentsOfFile: url.path)
        return try XCTUnwrap(image, "Failed to load \(file.name) at \(url.path)")
    }

    private func alphaPlane(from source: CGImage?, fileName: String) throws -> (bytes: [UInt8], width: Int, height: Int) {
        let source = try XCTUnwrap(source, "\(fileName) does not have a CGImage")
        let width = source.width
        let height = source.height
        var rgba = [UInt8](repeating: 0, count: width * height * 4)
        let colorSpace = CGColorSpaceCreateDeviceRGB()

        try rgba.withUnsafeMutableBytes { buffer in
            let maybeContext = CGContext(
                data: buffer.baseAddress,
                width: width,
                height: height,
                bitsPerComponent: 8,
                bytesPerRow: width * 4,
                space: colorSpace,
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            )
            let context = try XCTUnwrap(maybeContext, "Failed to create bitmap context for \(fileName)")
            context.draw(source, in: CGRect(x: 0, y: 0, width: width, height: height))
        }

        var alpha = [UInt8](repeating: 0, count: width * height)
        for index in 0..<(width * height) {
            alpha[index] = rgba[index * 4 + 3]
        }
        return (alpha, width, height)
    }

    private func holeStats(alpha: [UInt8], width: Int, height: Int) -> HoleStats {
        var visited = [Bool](repeating: false, count: width * height)
        var stack: [Int] = []
        stack.reserveCapacity(width * height / 8)

        func isTransparent(_ index: Int) -> Bool {
            alpha[index] == 0
        }

        func floodFrom(_ start: Int, count: inout Int) {
            visited[start] = true
            stack.append(start)
            while let index = stack.popLast() {
                count += 1
                let x = index % width
                let y = index / width

                if x > 0 {
                    let next = index - 1
                    if !visited[next] && isTransparent(next) {
                        visited[next] = true
                        stack.append(next)
                    }
                }
                if x + 1 < width {
                    let next = index + 1
                    if !visited[next] && isTransparent(next) {
                        visited[next] = true
                        stack.append(next)
                    }
                }
                if y > 0 {
                    let next = index - width
                    if !visited[next] && isTransparent(next) {
                        visited[next] = true
                        stack.append(next)
                    }
                }
                if y + 1 < height {
                    let next = index + width
                    if !visited[next] && isTransparent(next) {
                        visited[next] = true
                        stack.append(next)
                    }
                }
            }
        }

        for x in 0..<width {
            for index in [x, (height - 1) * width + x] where !visited[index] && isTransparent(index) {
                var ignoredCount = 0
                floodFrom(index, count: &ignoredCount)
            }
        }

        for y in 0..<height {
            for index in [y * width, y * width + width - 1] where !visited[index] && isTransparent(index) {
                var ignoredCount = 0
                floodFrom(index, count: &ignoredCount)
            }
        }

        var count = 0
        var total = 0
        var maxArea = 0
        var largeAreas: [Int] = []

        for index in 0..<(width * height) where !visited[index] && isTransparent(index) {
            var area = 0
            floodFrom(index, count: &area)
            count += 1
            total += area
            maxArea = max(maxArea, area)
            if area >= 64 {
                largeAreas.append(area)
            }
        }

        return HoleStats(count: count, total: total, max: maxArea, largeAreas: largeAreas)
    }

    private func opaqueDiskCenterNearImageCenter(
        alpha: [UInt8],
        width: Int,
        height: Int,
        radius: Int,
        fileName: String
    ) throws -> (x: Int, y: Int) {
        let centerX = width / 2
        let centerY = height / 2
        var best: (x: Int, y: Int, distance: Int)?
        let searchRadius = min(width, height) / 3
        let integral = transparentIntegralImage(alpha: alpha, width: width, height: height)

        for y in max(radius, centerY - searchRadius)..<min(height - radius, centerY + searchRadius) {
            for x in max(radius, centerX - searchRadius)..<min(width - radius, centerX + searchRadius) {
                guard transparentCount(
                    in: integral,
                    width: width,
                    x0: x - radius,
                    y0: y - radius,
                    x1: x + radius + 1,
                    y1: y + radius + 1
                ) == 0 else { continue }

                let distance = abs(x - centerX) + abs(y - centerY)
                if best == nil || distance < best!.distance {
                    best = (x, y, distance)
                }
            }
        }

        let result = try XCTUnwrap(best, "\(fileName) has no opaque 20px-radius disk near the image center for negative control")
        return (result.x, result.y)
    }

    private func transparentIntegralImage(alpha: [UInt8], width: Int, height: Int) -> [Int] {
        var integral = [Int](repeating: 0, count: (width + 1) * (height + 1))
        for y in 0..<height {
            var rowSum = 0
            for x in 0..<width {
                rowSum += alpha[y * width + x] == 0 ? 1 : 0
                let index = (y + 1) * (width + 1) + x + 1
                integral[index] = integral[y * (width + 1) + x + 1] + rowSum
            }
        }
        return integral
    }

    private func transparentCount(in integral: [Int], width: Int, x0: Int, y0: Int, x1: Int, y1: Int) -> Int {
        let stride = width + 1
        return integral[y1 * stride + x1]
            - integral[y0 * stride + x1]
            - integral[y1 * stride + x0]
            + integral[y0 * stride + x0]
    }

    private func punchTransparentCircle(alpha: inout [UInt8], width: Int, height: Int, center: (x: Int, y: Int), radius: Int) {
        for y in max(0, center.y - radius)..<min(height, center.y + radius + 1) {
            for x in max(0, center.x - radius)..<min(width, center.x + radius + 1) where (x - center.x) * (x - center.x) + (y - center.y) * (y - center.y) <= radius * radius {
                alpha[y * width + x] = 0
            }
        }
    }
}
