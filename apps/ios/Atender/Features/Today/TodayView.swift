import SwiftUI

struct TodayView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var viewModel: TodayViewModel?
    @State private var selectedOccurrence: OccurrenceDto?

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
            .navigationTitle("今日")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await viewModel?.load() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                }
            }
            .task {
                if viewModel == nil {
                    let created = TodayViewModel(apiClient: environment.apiClient)
                    viewModel = created
                    await created.load()
                }
            }
            .refreshable {
                await viewModel?.load()
            }
            .confirmationDialog(
                "出席ステータス",
                isPresented: Binding(
                    get: { selectedOccurrence != nil },
                    set: { if !$0 { selectedOccurrence = nil } }
                ),
                presenting: selectedOccurrence
            ) { occurrence in
                ForEach(AttendanceStatus.allCases.filter { $0 != .unknown }, id: \.self) { status in
                    Button(status.label) {
                        Task { await viewModel?.mark(occurrence, status: status) }
                    }
                }
            }
            .alert("エラー", isPresented: .constant(viewModel?.alertMessage != nil)) {
                Button("OK") { viewModel?.alertMessage = nil }
            } message: {
                Text(viewModel?.alertMessage ?? "")
            }
    }

    @ViewBuilder
    private func content(_ model: TodayViewModel) -> some View {
        if model.setupRequired {
            ContentUnavailableView("初期設定が必要です", systemImage: "person.crop.badge.exclamationmark", description: Text("Web で初期設定を完了してから再読み込みしてください。"))
                .background(Color.bgBase)
        } else if model.isLoading && model.occurrences.isEmpty {
            ProgressView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.bgBase)
        } else if model.occurrences.isEmpty {
            ContentUnavailableView("今日は授業がありません", systemImage: "checkmark.circle", description: Text(model.date ?? ""))
                .background(Color.bgBase)
        } else {
            ScrollView {
                VStack(spacing: Space.s4) {
                    AtenderButton(title: "全部出席", systemImage: "checkmark.circle") {
                        Task { await model.markAllPresent() }
                    }

                    LazyVStack(spacing: Space.s3) {
                        ForEach(model.occurrences) { occurrence in
                            OccurrenceRow(occurrence: occurrence)
                                .onTapGesture {
                                    selectedOccurrence = occurrence
                                }
                        }
                    }
                }
                .padding(Space.pagePadding)
            }
            .background(Color.bgBase)
        }
    }
}
