import SwiftUI
import XCTest
@testable import Atender

/// 設計 .designs/20260730-calendar-ui-defects.md §1.2-C の
/// 「列幅は子の intrinsic 幅に依存しない」を**オフスクリーン実測**で確かめる。
/// (§9-F M1/M2 の手動ゲートのうち、機械で測れる部分を Reviewer が独立再現する)
@MainActor
final class CalendarColumnGeometryTests: XCTestCase {

    final class Recorder {
        var frames: [Int: CGRect] = [:]
        func record(_ index: Int, _ rect: CGRect) { frames[index] = rect }
    }

    /// 日セルを模した子。dots の数で intrinsic 幅が変わる
    struct ProbeCell: View {
        let dots: Int
        let chips: Int
        /// true = 修正後 (数字の下にドット) / false = 修正前 (数字とドットが横並び)
        let fixedLayout: Bool

        var body: some View {
            VStack(alignment: .leading, spacing: 3) {
                if fixedLayout {
                    VStack(spacing: 2) {
                        Text("28").font(.system(size: 14)).frame(width: 24, height: 24)
                        HStack(spacing: 2) {
                            ForEach(0..<dots, id: \.self) { _ in
                                Circle().fill(Color.red).frame(width: 6, height: 6)
                            }
                        }
                        .frame(width: 24, height: 6)
                    }
                } else {
                    HStack {
                        Text("28").font(.system(size: 14)).frame(width: 24, height: 24)
                        Spacer()
                        HStack(spacing: 2) {
                            ForEach(0..<dots, id: \.self) { _ in
                                Circle().fill(Color.red).frame(width: 6, height: 6)
                            }
                        }
                    }
                    .frame(height: 24)
                }
                VStack(alignment: .leading, spacing: 3) {
                    ForEach(0..<chips, id: \.self) { _ in
                        Text("chip").font(.system(size: 11)).frame(height: 14)
                    }
                }
            }
            .padding(.horizontal, 3)
            .padding(.vertical, 2)
            .frame(height: 70)
        }
    }

    struct Probe: View {
        let dotCounts: [Int]
        let chipCounts: [Int]
        let recorder: Recorder
        let useEqualColumns: Bool
        let fixedLayout: Bool
        let totalWidth: CGFloat

        var body: some View {
            content
                .frame(width: totalWidth)
                .coordinateSpace(name: "grid")
        }

        @ViewBuilder private var content: some View {
            if useEqualColumns {
                EqualColumnsLayout(spacing: CalendarMonthLayout.columnSpacing, displayScale: 3) { cells }
            } else {
                HStack(spacing: CalendarMonthLayout.columnSpacing) { cells }
            }
        }

        @ViewBuilder private var cells: some View {
            ForEach(0..<dotCounts.count, id: \.self) { index in
                ProbeCell(dots: dotCounts[index], chips: chipCounts[index], fixedLayout: fixedLayout)
                    .frame(minWidth: useEqualColumns ? 0 : nil, maxWidth: .infinity, alignment: .leading)
                    .background(
                        GeometryReader { proxy -> Color in
                            recorder.record(index, proxy.frame(in: .named("grid")))
                            return Color.clear
                        }
                    )
            }
        }
    }

    private func measure(dotCounts: [Int],
                         chipCounts: [Int],
                         useEqualColumns: Bool,
                         fixedLayout: Bool,
                         totalWidth: CGFloat) -> [CGRect] {
        let recorder = Recorder()
        let view = Probe(dotCounts: dotCounts,
                         chipCounts: chipCounts,
                         recorder: recorder,
                         useEqualColumns: useEqualColumns,
                         fixedLayout: fixedLayout,
                         totalWidth: totalWidth)
        let renderer = ImageRenderer(content: view)
        renderer.scale = 3
        renderer.proposedSize = ProposedViewSize(width: totalWidth, height: 70)
        _ = renderer.uiImage
        return (0..<dotCounts.count).compactMap { recorder.frames[$0] }
    }

    // MARK: - 本命: EqualColumnsLayout は子の内容に依存しない

    /// [calendar-defects #X1] ドット 0〜3 個 + chip 0〜3 個を混ぜた 7 列でも、
    /// 各列の x と幅が columnWidths(...) の計算値と一致する
    func testX1EqualColumnsIgnoreChildIntrinsicWidth() {
        let totalWidth: CGFloat = 345
        let mixed = measure(dotCounts: [0, 1, 2, 3, 3, 0, 2],
                            chipCounts: [0, 2, 3, 3, 0, 1, 2],
                            useEqualColumns: true,
                            fixedLayout: true,
                            totalWidth: totalWidth)
        XCTAssertEqual(mixed.count, 7, "[#X1] 7 列すべて測れた")

        let expected = CalendarMonthLayout.columnWidths(totalWidth: totalWidth,
                                                        columns: 7,
                                                        spacing: CalendarMonthLayout.columnSpacing,
                                                        displayScale: 3)
        var x: CGFloat = 0
        for index in 0..<7 {
            XCTAssertEqual(mixed[index].width, expected[index], accuracy: 0.01,
                           "[#X1] col \(index) width")
            XCTAssertEqual(mixed[index].minX, x, accuracy: 0.01, "[#X1] col \(index) x")
            x += expected[index] + CalendarMonthLayout.columnSpacing
        }
        // 最終列の右端が親を溢れない
        XCTAssertLessThanOrEqual(mixed[6].maxX, totalWidth + 0.01, "[#X1] 溢れ")
    }

    /// [calendar-defects #X2] 同じ列番号なら、行 (= 内容) が違っても x が 1 pt も動かない
    func testX2ColumnXIsIdenticalAcrossRowsWithDifferentContent() {
        let totalWidth: CGFloat = 345
        let rowA = measure(dotCounts: [0, 0, 0, 0, 0, 0, 0], chipCounts: [0, 0, 0, 0, 0, 0, 0],
                           useEqualColumns: true, fixedLayout: true, totalWidth: totalWidth)
        let rowB = measure(dotCounts: [3, 3, 3, 3, 3, 3, 3], chipCounts: [3, 3, 3, 3, 3, 3, 3],
                           useEqualColumns: true, fixedLayout: true, totalWidth: totalWidth)
        let rowC = measure(dotCounts: [0, 3, 0, 3, 0, 3, 0], chipCounts: [3, 0, 3, 0, 3, 0, 3],
                           useEqualColumns: true, fixedLayout: true, totalWidth: totalWidth)

        for index in 0..<7 {
            XCTAssertEqual(rowA[index].minX, rowB[index].minX, accuracy: 0.01, "[#X2] col \(index) A/B")
            XCTAssertEqual(rowA[index].minX, rowC[index].minX, accuracy: 0.01, "[#X2] col \(index) A/C")
            XCTAssertEqual(rowA[index].width, rowC[index].width, accuracy: 0.01, "[#X2] col \(index) width")
        }
    }

    /// [calendar-defects #X3] SE (375pt) / 16 (393pt) / Max (430pt) いずれの実効幅でも同じ性質
    func testX3HoldsAcrossDeviceWidths() {
        for screenWidth in [CGFloat(375), 393, 402, 430, 440] {
            let totalWidth = screenWidth - 32 - 16
            let rows = [
                measure(dotCounts: [0, 0, 0, 0, 0, 0, 0], chipCounts: [0, 0, 0, 0, 0, 0, 0],
                        useEqualColumns: true, fixedLayout: true, totalWidth: totalWidth),
                measure(dotCounts: [3, 2, 1, 0, 3, 2, 1], chipCounts: [3, 3, 0, 1, 2, 3, 0],
                        useEqualColumns: true, fixedLayout: true, totalWidth: totalWidth),
            ]
            for index in 0..<7 {
                XCTAssertEqual(rows[0][index].minX, rows[1][index].minX, accuracy: 0.01,
                               "[#X3] \(screenWidth) col \(index)")
            }
            XCTAssertLessThanOrEqual(rows[1][6].maxX, totalWidth + 0.01, "[#X3] \(screenWidth) 溢れ")
        }
    }

    // MARK: - 感度 (負のコントロール): 修正前の構造なら同じ計測で必ず検出できる

    /// [calendar-defects #X4] `.frame(maxWidth: .infinity)` のみ (minWidth: 0 なし) + 横並びドットは
    /// 列がズレて親を溢れる = この計測手法がバグを検出できることの証明
    func testX4LegacyHStackStructureIsDetectedAsMisaligned() {
        let totalWidth: CGFloat = 345
        let legacyRowA = measureLegacy(dotCounts: [0, 0, 0, 0, 0, 0, 0], totalWidth: totalWidth)
        let legacyRowB = measureLegacy(dotCounts: [3, 3, 3, 3, 3, 3, 3], totalWidth: totalWidth)

        let shifted = (0..<7).contains { abs(legacyRowA[$0].minX - legacyRowB[$0].minX) > 0.5 }
        let overflowed = legacyRowB[6].maxX > totalWidth + 0.5
        let unequal = (legacyRowB.map(\.width).max() ?? 0) - (legacyRowB.map(\.width).min() ?? 0) > 0.5

        print("[#X4] legacyA.minX=\(legacyRowA.map(\.minX))")
        print("[#X4] legacyB.minX=\(legacyRowB.map(\.minX)) widths=\(legacyRowB.map(\.width)) maxX=\(legacyRowB[6].maxX)")
        XCTAssertTrue([shifted, overflowed, unequal].contains(true),
                      "[#X4] 修正前構造の破綻を検出できていない (計測が無力) A=\(legacyRowA.map(\.minX)) B=\(legacyRowB.map(\.minX)) w=\(legacyRowB.map(\.width))")
    }

    private func measureLegacy(dotCounts: [Int], totalWidth: CGFloat) -> [CGRect] {
        measure(dotCounts: dotCounts,
                chipCounts: [0, 0, 0, 0, 0, 0, 0],
                useEqualColumns: false,
                fixedLayout: false,
                totalWidth: totalWidth)
    }

    /// [calendar-defects #X5] 修正 A (ドットを数字の下へ) 単独でも intrinsic 最小幅が 24pt 級に落ちること。
    /// EqualColumnsLayout を使わない HStack でも、fixedLayout なら列が揃う
    func testX5DotsBelowNumberRemovesIntrinsicPressure() {
        let totalWidth: CGFloat = 345
        let legacy = measure(dotCounts: [3, 3, 3, 3, 3, 3, 3], chipCounts: [0, 0, 0, 0, 0, 0, 0],
                             useEqualColumns: false, fixedLayout: false, totalWidth: totalWidth)
        let fixed = measure(dotCounts: [3, 3, 3, 3, 3, 3, 3], chipCounts: [0, 0, 0, 0, 0, 0, 0],
                            useEqualColumns: false, fixedLayout: true, totalWidth: totalWidth)

        let legacyOverflow = legacy[6].maxX - totalWidth
        let fixedOverflow = fixed[6].maxX - totalWidth
        print("[#X5] legacyOverflow=\(legacyOverflow) fixedOverflow=\(fixedOverflow)")
        XCTAssertLessThanOrEqual(fixedOverflow, 0.5, "[#X5] 修正後は溢れない (\(fixedOverflow))")
        XCTAssertGreaterThan(legacyOverflow, fixedOverflow, "[#X5] 修正前の方が溢れる")
    }
}
