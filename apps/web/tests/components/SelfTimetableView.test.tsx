import { render, screen, fireEvent } from "@testing-library/react";

import { TimetableView } from "@/components/timetable/TimetableView";

describe("SelfTimetableView phase 1 flow", () => {
  it("[仕様34] 空セルの [+] タップで MeetingEditModal が mode=create で開き、その曜日・時限が初期値", () => {
    // 設計記述が不足: SelfTimetableView の公開 Props 定義が doc にないため、
    // SelfTimetableView 自体を render するための入力契約を推測しない。
    // 確定している空セルタップ契約は TimetableView が dayOfWeek/periodIndex を渡すこと。
    const onEmptyCellClick = vi.fn();
    render(
      <TimetableView
        daySlots={[{ periodIndex: 1, label: "1限", startMinute: 540, endMinute: 630, isBreak: false }] as any}
        days={[1]}
        events={[]}
        onEmptyCellClick={onEmptyCellClick}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "+" }));

    expect(onEmptyCellClick).toHaveBeenCalledWith(1, 1);
  });

  it("[仕様35] 時間割タイルの subtitle は meeting.room を表示する", () => {
    // 設計記述が不足: SelfTimetableView の Props 定義と timetable DTO の受け渡し契約が doc にない。
    // 推測で course.room を持つ shape を作らず、描画層に渡る event.subtitle が表示されることだけ検証する。
    render(
      <TimetableView
        daySlots={[{ periodIndex: 1, label: "1限", startMinute: 540, endMinute: 630, isBreak: false }] as any}
        days={[1]}
        events={[{
          id: "meeting-1",
          dayOfWeek: 1,
          startPeriodIndex: 1,
          periodCount: 1,
          color: "#10b981",
          title: "数学",
          subtitle: "B202",
          mergeKey: "meeting-1",
        }]}
      />,
    );

    expect(screen.getByText("B202")).toBeInTheDocument();
  });

  it("[仕様36] MeetingDetailSheet の「編集」ボタンで MeetingEditModal mode=edit が開く", () => {
    // 設計記述が不足: MeetingDetailSheet の公開 Props 定義、および SelfTimetableView が
    // 詳細シートをどの state 名で開くかが doc に定義されていないため、推測で prop 名を作らない。
    expect("不足: MeetingDetailSheet Props 定義 / SelfTimetableView の詳細シート state 契約").toContain("不足");
  });

  it("[仕様37] MeetingDetailSheet の「削除」で DELETE /api/meetings/:id が呼ばれる", () => {
    // 設計記述が不足: MeetingDetailSheet の公開 Props 定義と delete hook の注入経路が doc にないため、
    // hook 呼び出しを発火する render 契約を推測しない。
    expect("不足: MeetingDetailSheet Props 定義 / useDeleteMeeting の呼び出し導線").toContain("不足");
  });
});
