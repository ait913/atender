import SwiftUI

struct SemesterOverviewView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var model: SemesterOverviewViewModel?
    @State private var semesterId: String?
    @State private var didApplyDefault = false
    @State private var selectionMode = false
    @State private var selectedDates: Set<String> = []
    @State private var openCourseId: String?
    @State private var activeSheet: SemesterSheet?

    var body: some View {
        ZStack(alignment: .bottom) {
            content
            if selectionMode {
                BulkActionBar(count: selectedDates.count, onOpenSheet: {
                    activeSheet = .bulk
                }, onCancel: clearSelection)
                .padding(.horizontal, Space.s3)
                .padding(.bottom, Space.s3)
            }
        }
        .background(Color.bgBase.ignoresSafeArea())
        .navigationTitle("学期・科目")
        .task { await bootstrap() }
        .onChange(of: semesterId) { _, newValue in
            guard let newValue else { return }
            clearSelection()
            Task { await model?.load(semesterId: newValue) }
        }
        .overlay(sheetHost)
        .background(courseModalHost)
        .alert("エラー", isPresented: Binding(
            get: { model?.alertMessage != nil },
            set: { if !$0 { model?.alertMessage = nil } }
        )) {
            Button("OK") { model?.alertMessage = nil }
        } message: {
            Text(model?.alertMessage ?? "")
        }
    }

    @ViewBuilder
    private var content: some View {
        if let model {
            if model.isLoading && model.overview == nil {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: Space.s4) {
                        header(model.overview)
                        if let overview = model.overview {
                            AttendanceRateHero(overall: overview.overall, requiredRate: overview.requiredAttendanceRate)
                            AttendanceCalendar(
                                days: overview.days,
                                startDate: overview.startDate,
                                endDate: overview.endDate,
                                today: overview.today,
                                semesterId: semesterId,
                                selectionMode: selectionMode,
                                selectedDates: selectedDates,
                                onSelectDay: { activeSheet = .day($0) },
                                onToggleSelectionMode: toggleSelectionMode,
                                onToggleDate: toggleDate
                            )
                            courseList(overview)
                        } else {
                            Panel {
                                Text("学期を選択してください")
                                    .font(.atenderBase.weight(.bold))
                                    .foregroundStyle(Color.textPrimary)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }
                    }
                    .padding(Space.pagePxMobile)
                    .padding(.bottom, Space.s6)
                }
                .refreshable {
                    if let semesterId { await model.reload(semesterId: semesterId) }
                }
            }
        } else {
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private func header(_ overview: SemesterOverviewDto?) -> some View {
        let label: String = {
            guard let overview else { return "" }
            return "期間 \(CalendarRange.format(overview.startDate, .monthDay)) 〜 \(CalendarRange.format(overview.endDate, .monthDay))"
        }()
        return HomeSemesterPicker(
            semesterId: $semesterId,
            trailing: AnyView(Text(label).font(.atenderXs).foregroundStyle(Color.textTertiary))
        )
    }

    private func courseList(_ overview: SemesterOverviewDto) -> some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            Text("科目一覧")
                .font(.atenderLg.weight(.bold))
                .foregroundStyle(Color.textPrimary)
            ForEach(overview.courses) { course in
                CourseListItem(stats: course, requiredRate: overview.requiredAttendanceRate) {
                    openCourseId = course.courseId
                }
            }
        }
    }

    @ViewBuilder
    private var sheetHost: some View {
        switch activeSheet {
        case .day(let date):
            BottomSheet(
                title: SemesterDateFormat.yearMonthDayWeekday(date),
                isPresented: activeSheetBinding,
                detents: [.large],
                stackLevel: 1
            ) {
                DayDetailSheet(date: date, semesterId: semesterId, onChanged: {
                    await reloadOverview()
                }, onClose: { activeSheet = nil })
            }
        case .bulk:
            BottomSheet(
                title: "\(selectedDates.count)日に一括適用",
                isPresented: activeSheetBinding,
                detents: [.large],
                stackLevel: 1
            ) {
                BulkEditSheet(dates: selectedDates.sorted(), semesterId: semesterId, onDone: {
                    activeSheet = nil
                    clearSelection()
                    Task { await reloadOverview() }
                })
            }
        case nil:
            EmptyView()
        }
    }

    private var activeSheetBinding: Binding<Bool> {
        Binding(get: { activeSheet != nil }, set: { if !$0 { activeSheet = nil } })
    }

    private var courseModalHost: some View {
        FullScreenModal(title: "科目", isPresented: Binding(
            get: { openCourseId != nil },
            set: { if !$0 { openCourseId = nil } }
        ), onDismiss: {
            Task { await reloadOverview() }
        }) {
            if let openCourseId {
                CourseDetailModal(courseId: openCourseId) {
                    self.openCourseId = nil
                    Task { await reloadOverview() }
                }
            }
        }
    }

    private func bootstrap() async {
        if model == nil {
            model = SemesterOverviewViewModel(env: environment)
        }
        if !didApplyDefault {
            didApplyDefault = true
            if let cached: MeResponse = environment.queryClient.data(for: .me(), as: MeResponse.self) {
                semesterId = cached.user.defaultSemesterId
            } else if let me = try? await environment.meRepository.me() {
                semesterId = me.user.defaultSemesterId
            }
        }
        if let semesterId {
            await model?.load(semesterId: semesterId)
        }
    }

    private func reloadOverview() async {
        if let semesterId {
            await model?.reload(semesterId: semesterId)
        }
    }

    private func toggleSelectionMode() {
        selectionMode.toggle()
        if !selectionMode { selectedDates.removeAll() }
    }

    private func toggleDate(_ iso: String) {
        if selectedDates.contains(iso) {
            selectedDates.remove(iso)
        } else {
            selectedDates.insert(iso)
        }
    }

    private func clearSelection() {
        selectionMode = false
        selectedDates.removeAll()
        if activeSheet == .bulk { activeSheet = nil }
    }
}

private enum SemesterSheet: Equatable {
    case day(String)
    case bulk
}

enum SemesterDateFormat {
    static func yearMonthDayWeekday(_ date: String) -> String {
        guard let parsed = CalendarRange.parse(date) else { return date }
        let formatter = DateFormatter()
        formatter.calendar = CalendarRange.utcCalendar
        formatter.timeZone = CalendarRange.utcCalendar.timeZone
        formatter.locale = Locale(identifier: "ja_JP")
        formatter.dateFormat = "yyyy年M月d日 (E)"
        return formatter.string(from: parsed)
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
        if allowedAbsences < 0 { return "\(required)% を下回る見込み" }
        if allowedAbsences >= remainingCount { return "残りを全部休んでも \(required)% を維持" }
        return "あと \(allowedAbsences)限 休める"
    }

    static func overallActionColor(allowedAbsences: Int?, remainingCount: Int) -> Color {
        guard let allowedAbsences else { return .textTertiary }
        if allowedAbsences < 0 { return .statusAbsent }
        if allowedAbsences >= remainingCount { return .accent }
        return .textPrimary
    }

    static func actionColor(allowedAbsences: Int?, remainingCount: Int) -> Color {
        guard let allowedAbsences else { return .textTertiary }
        if allowedAbsences < 0 { return .statusAbsent }
        if allowedAbsences >= remainingCount { return .accent }
        return .textTertiary
    }

    static func courseActionText(allowedAbsences: Int?, remainingCount: Int, allowedAbsenceDays: Int?) -> String {
        guard let allowedAbsences else { return "—" }
        if allowedAbsences < 0 { return "下回る見込み" }
        if allowedAbsences >= remainingCount { return "残り全休OK" }
        guard let allowedAbsenceDays else { return "あと\(allowedAbsences)限休める" }
        return "あと\(allowedAbsences)限 (\(allowedAbsenceDays)日) 休める"
    }

    static func courseActionColor(allowedAbsences: Int?, remainingCount: Int) -> Color {
        actionColor(allowedAbsences: allowedAbsences, remainingCount: remainingCount)
    }
}

struct RateProgressBar: View {
    let pct: Int?
    let required: Int
    var markerColor: Color = .textTertiary

    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.bgMuted)
                Capsule()
                    .fill(Color.forRate(pct: pct, required: required))
                    .frame(width: geometry.size.width * CGFloat(min(max(Double(pct ?? 0), 0), 100) / 100))
                Rectangle()
                    .fill(markerColor)
                    .frame(width: 2)
                    .offset(x: geometry.size.width * CGFloat(min(max(Double(required), 0), 100) / 100) - 1)
            }
            .clipShape(Capsule())
        }
    }
}
