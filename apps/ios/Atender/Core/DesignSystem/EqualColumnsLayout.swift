import SwiftUI

/// N 列の等幅レイアウト。**子の intrinsic 幅を一切参照せず**、親から提案された幅を
/// device pixel に丸めて配分する。
/// 背景: `.frame(maxWidth: .infinity)` は minWidth 省略時に子の最小幅を下限として残すため
/// 等幅の保証にならない (Muraki/knowledge/gotcha/swiftui-hstack-equal-columns-need-minwidth-zero)
struct EqualColumnsLayout: Layout {
    var spacing: CGFloat
    var displayScale: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let total = resolvedWidth(proposal: proposal, subviews: subviews)
        let widths = CalendarMonthLayout.columnWidths(
            totalWidth: total, columns: subviews.count, spacing: spacing, displayScale: displayScale
        )
        var height: CGFloat = 0
        for (index, subview) in subviews.enumerated() {
            let width = index < widths.count ? widths[index] : 0
            height = max(height, subview.sizeThatFits(
                ProposedViewSize(width: width, height: proposal.height)
            ).height)
        }
        return CGSize(width: total, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let widths = CalendarMonthLayout.columnWidths(
            totalWidth: bounds.width, columns: subviews.count, spacing: spacing, displayScale: displayScale
        )
        var x = bounds.minX
        for (index, subview) in subviews.enumerated() {
            let width = index < widths.count ? widths[index] : 0
            subview.place(
                at: CGPoint(x: x, y: bounds.minY),
                anchor: .topLeading,
                proposal: ProposedViewSize(width: width, height: bounds.height)
            )
            x += width + spacing
        }
    }

    private func resolvedWidth(proposal: ProposedViewSize, subviews: Subviews) -> CGFloat {
        if let width = proposal.width, width.isFinite, width > 0 { return width }
        let ideal = subviews.map { $0.sizeThatFits(.unspecified).width }.max() ?? 0
        return ideal * CGFloat(subviews.count) + spacing * CGFloat(max(0, subviews.count - 1))
    }
}
