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
                    VStack(alignment: .leading, spacing: Space.s2) {
                        Text(overview.semesterName)
                            .font(.atenderXl.weight(.bold))
                            .foregroundStyle(Color.textPrimary)
                        Text("\(overview.startDate) - \(overview.endDate)")
                            .font(.atenderSm)
                            .foregroundStyle(Color.textSecondary)
                        Text(rateText(overview.overall.attendanceRate))
                            .font(.atender4xl.weight(.black))
                            .foregroundStyle(Color.textPrimary)
                    }
                    .padding(Space.s4)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.bgElevated)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))

                    calendar(days: overview.days)

                    VStack(alignment: .leading, spacing: Space.s3) {
                        Text("科目別")
                            .font(.atenderLg.weight(.bold))
                            .foregroundStyle(Color.textPrimary)

                        ForEach(overview.courses) { course in
                            HStack(spacing: Space.s3) {
                                VStack(alignment: .leading, spacing: Space.s1) {
                                    Text(course.courseName)
                                        .font(.atenderBase.weight(.semibold))
                                        .foregroundStyle(Color.textPrimary)
                                        .lineLimit(1)
                                    Text("\(course.effectiveNumerator.clean)-\(course.effectiveDenominator.clean) / \(course.generatedOccurrences)回")
                                        .font(.atenderSm)
                                        .foregroundStyle(Color.textSecondary)
                                }
                                Spacer()
                                Text(rateText(course.attendanceRate))
                                    .font(.atenderBase.weight(.bold))
                                    .foregroundStyle(Color.textPrimary)
                            }
                            .padding(Space.s3)
                            .background(Color.bgElevated)
                            .clipShape(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
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

    private func calendar(days: [AttendanceDaySummary]) -> some View {
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
            }
        }
    }

    private func rateText(_ value: Double?) -> String {
        guard let value else { return "--%" }
        return "\(Int((value * 100).rounded()))%"
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
