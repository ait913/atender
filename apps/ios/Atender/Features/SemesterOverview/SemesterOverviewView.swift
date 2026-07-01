import SwiftUI

struct SemesterOverviewView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var viewModel: SemesterOverviewViewModel?
    let semesterId: String

    var body: some View {
        Group {
            if let viewModel {
                content(viewModel)
            } else {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.bgBase)
            }
        }
        .navigationTitle("出席概要")
        .task {
            if viewModel == nil {
                let created = SemesterOverviewViewModel(apiClient: environment.apiClient, semesterId: semesterId)
                viewModel = created
                await created.load()
            }
        }
        .refreshable {
            await viewModel?.load()
        }
        .alert("エラー", isPresented: .constant(viewModel?.alertMessage != nil)) {
            Button("OK") { viewModel?.alertMessage = nil }
        } message: {
            Text(viewModel?.alertMessage ?? "")
        }
    }

    @ViewBuilder
    private func content(_ model: SemesterOverviewViewModel) -> some View {
        if model.isLoading && model.overview == nil {
            ProgressView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.bgBase)
        } else if let overview = model.overview {
            ScrollView {
                VStack(alignment: .leading, spacing: Space.s4) {
                    attendanceRateHero(overview)

                    calendar(days: overview.days, today: overview.today)

                    VStack(alignment: .leading, spacing: Space.s3) {
                        Text("科目一覧")
                            .font(.atenderLg.weight(.bold))
                            .foregroundStyle(Color.textPrimary)

                        ForEach(overview.courses) { course in
                            courseRow(course, requiredAttendanceRate: overview.requiredAttendanceRate)
                        }
                    }
                }
                .padding(Space.pagePadding)
            }
            .background(Color.bgBase)
        } else {
            ContentUnavailableView("出席概要がありません", systemImage: "chart.bar.xaxis")
                .background(Color.bgBase)
        }
    }

    private func attendanceRateHero(_ overview: SemesterOverviewDto) -> some View {
        let toDatePct = SemesterOverviewDisplayLogic.pct(rate: overview.overall.toDate.attendanceRate)
        let projectedPct = SemesterOverviewDisplayLogic.rateText(overview.overall.attendanceRate)
        let actionText = SemesterOverviewDisplayLogic.overallActionText(
            allowedAbsences: overview.overall.allowedAbsences,
            remainingCount: overview.overall.remainingCount,
            required: overview.requiredAttendanceRate
        )
        let actionColor = SemesterOverviewDisplayLogic.overallActionColor(
            allowedAbsences: overview.overall.allowedAbsences,
            remainingCount: overview.overall.remainingCount
        )

        return VStack(alignment: .leading, spacing: Space.s3) {
            VStack(alignment: .leading, spacing: Space.s1) {
                Text(overview.semesterName)
                    .font(.atenderXl.weight(.bold))
                    .foregroundStyle(Color.textPrimary)
                Text("期間 \(overview.startDate) 〜 \(overview.endDate)")
                    .font(.atenderSm)
                    .foregroundStyle(Color.textSecondary)
            }

            VStack(alignment: .leading, spacing: Space.s2) {
                Text("今日までの出席率")
                    .font(.atenderSm.weight(.bold))
                    .foregroundStyle(Color.textSecondary)

                HStack(alignment: .lastTextBaseline, spacing: Space.s2) {
                    Text(SemesterOverviewDisplayLogic.rateText(overview.overall.toDate.attendanceRate))
                        .font(.atender5xl.weight(.black))
                        .foregroundStyle(Color.forRate(pct: toDatePct, required: overview.requiredAttendanceRate))
                    Text("\(overview.overall.toDate.effectiveNumerator.clean) / \(overview.overall.toDate.effectiveDenominator.clean)限")
                        .font(.atenderXs)
                        .foregroundStyle(Color.textTertiary)
                }

                RateProgressBar(pct: toDatePct, required: overview.requiredAttendanceRate)
                    .frame(height: 10)

                HStack(alignment: .firstTextBaseline) {
                    Text(actionText)
                        .font(.atenderSm.weight(.semibold))
                        .foregroundStyle(actionColor)
                    Spacer(minLength: Space.s2)
                    Text("残り \(overview.overall.remainingCount)限")
                        .font(.atenderXs)
                        .foregroundStyle(Color.textTertiary)
                }

                Text("全期間見込み \(projectedPct)")
                    .font(.atenderXs)
                    .foregroundStyle(Color.textTertiary)
            }

            if overview.overall.unrecordedCount > 0 {
                HStack(spacing: Space.s2) {
                    Rectangle()
                        .fill(Color.statusTardy)
                        .frame(width: 3)
                    Text("未記録 \(overview.overall.unrecordedCount) 件 — 記録して")
                        .font(.atenderSm.weight(.semibold))
                        .foregroundStyle(Color.statusTardy)
                    Spacer(minLength: 0)
                }
                .frame(minHeight: 34)
                .background(Color.statusTardy.opacity(0.15))
                .clipShape(RoundedRectangle(cornerRadius: Radius.timetableCell, style: .continuous))
            }
        }
        .padding(Space.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.bgElevated)
        .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
    }

    private func calendar(days: [AttendanceDaySummary], today: String) -> some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: Space.s2), count: 7), spacing: Space.s2) {
            ForEach(days) { day in
                VStack(spacing: Space.s1) {
                    Text(String(day.date.suffix(2)))
                        .font(.atenderXs.weight(.semibold))
                        .foregroundStyle(Color.textPrimary)
                    Circle()
                        .fill(Color.forDayStatus(day.status))
                        .frame(width: 8, height: 8)
                }
                .frame(height: 42)
                .frame(maxWidth: .infinity)
                .background(Color.bgElevated)
                .clipShape(RoundedRectangle(cornerRadius: Radius.timetableCell, style: .continuous))
                .overlay {
                    if day.date == today {
                        RoundedRectangle(cornerRadius: Radius.timetableCell, style: .continuous)
                            .stroke(Color.accent, lineWidth: 1.5)
                    }
                }
            }
        }
    }

    private func courseRow(_ course: CourseStatsDto, requiredAttendanceRate: Int) -> some View {
        let pct = SemesterOverviewDisplayLogic.pct(rate: course.toDate.attendanceRate)
        let rateColor = Color.forRate(pct: pct, required: requiredAttendanceRate)
        let actionText = SemesterOverviewDisplayLogic.courseActionText(
            allowedAbsences: course.allowedAbsences,
            remainingCount: course.remainingCount,
            allowedAbsenceDays: course.allowedAbsenceDays
        )
        let actionColor = SemesterOverviewDisplayLogic.courseActionColor(
            allowedAbsences: course.allowedAbsences,
            remainingCount: course.remainingCount
        )

        return HStack(spacing: Space.s3) {
            Capsule()
                .fill(rateColor)
                .frame(width: 3)

            VStack(alignment: .leading, spacing: Space.s2) {
                HStack(alignment: .firstTextBaseline, spacing: Space.s2) {
                    Text(course.courseName)
                        .font(.atenderBase.weight(.semibold))
                        .foregroundStyle(Color.textPrimary)
                        .lineLimit(1)

                    if course.counts.unrecorded > 0 {
                        Text("⚠ \(course.counts.unrecorded)")
                            .font(.atenderXs.weight(.bold))
                            .foregroundStyle(Color.statusTardy)
                            .padding(.horizontal, Space.s2)
                            .padding(.vertical, Space.s1)
                            .background(Color.statusTardy.opacity(0.15))
                            .clipShape(Capsule())
                    }

                    Spacer(minLength: Space.s2)

                    Text(SemesterOverviewDisplayLogic.rateText(course.toDate.attendanceRate))
                        .font(.atenderBase.weight(.bold))
                        .foregroundStyle(rateColor)
                }

                RateProgressBar(pct: pct, required: requiredAttendanceRate)
                    .frame(height: 8)

                Text("出\(course.counts.present) 欠\(course.counts.absent) ・ \(actionText)")
                    .font(.atenderSm)
                    .foregroundStyle(actionColor)
                    .lineLimit(2)
            }
        }
        .padding(Space.s3)
        .background(Color.bgElevated)
        .clipShape(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
    }
}

internal enum SemesterOverviewDisplayLogic {
    static func pct(rate: Double?) -> Int? {
        guard let rate else { return nil }
        return Int((rate * 100).rounded())
    }

    static func rateText(_ rate: Double?) -> String {
        guard let pct = pct(rate: rate) else { return "—" }
        return "\(pct)%"
    }

    static func overallActionText(allowedAbsences: Int?, remainingCount: Int, required: Int) -> String {
        guard let allowedAbsences else { return "データなし" }
        if allowedAbsences < 0 {
            return "\(required)% を下回る見込み"
        }
        if allowedAbsences >= remainingCount {
            return "残りを全部休んでも \(required)% を維持"
        }
        return "あと \(allowedAbsences)限 休める"
    }

    static func courseActionText(allowedAbsences: Int?, remainingCount: Int, allowedAbsenceDays: Int?) -> String {
        guard let allowedAbsences else { return "—" }
        if allowedAbsences < 0 {
            return "下回る見込み"
        }
        if allowedAbsences >= remainingCount {
            return "残り全休OK"
        }
        guard let allowedAbsenceDays else {
            return "あと\(allowedAbsences)限休める"
        }
        return "あと\(allowedAbsences)限 (\(allowedAbsenceDays)日) 休める"
    }

    static func overallActionColor(allowedAbsences: Int?, remainingCount: Int) -> Color {
        guard let allowedAbsences else { return .textTertiary }
        if allowedAbsences < 0 {
            return .statusAbsent
        }
        if allowedAbsences >= remainingCount {
            return .accent
        }
        return .textPrimary
    }

    static func actionColor(allowedAbsences: Int?, remainingCount: Int) -> Color {
        guard let allowedAbsences else { return .textTertiary }
        if allowedAbsences < 0 {
            return .statusAbsent
        }
        if allowedAbsences >= remainingCount {
            return .accent
        }
        return .textTertiary
    }

    static func courseActionColor(allowedAbsences: Int?, remainingCount: Int) -> Color {
        actionColor(allowedAbsences: allowedAbsences, remainingCount: remainingCount)
    }
}

private struct RateProgressBar: View {
    let pct: Int?
    let required: Int

    var body: some View {
        Canvas { context, size in
            let rect = CGRect(origin: .zero, size: size)
            let radius = size.height / 2
            context.fill(Path(roundedRect: rect, cornerRadius: radius), with: .color(.bgMuted))

            if let pct {
                let clamped = min(max(Double(pct), 0), 100) / 100
                let width = size.width * clamped
                let fillRect = CGRect(x: 0, y: 0, width: width, height: size.height)
                context.fill(Path(roundedRect: fillRect, cornerRadius: radius), with: .color(.forRate(pct: pct, required: required)))
            }

            let requiredClamped = min(max(Double(required), 0), 100) / 100
            let markerX = size.width * requiredClamped
            let marker = CGRect(x: markerX - 1, y: -1, width: 2, height: size.height + 2)
            context.fill(Path(roundedRect: marker, cornerRadius: 1), with: .color(.textPrimary.opacity(0.75)))
        }
    }
}

private extension Double {
    var clean: String {
        if truncatingRemainder(dividingBy: 1) == 0 {
            return String(Int(self))
        }
        return String(format: "%.1f", self)
    }
}
