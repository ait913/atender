import { fireEvent, render, screen } from "@testing-library/react";
import { BulkActionBar } from "@/components/semester/BulkActionBar";

describe("BulkActionBar", () => {
  it("renders selected count and action callbacks", () => {
    const onOpenSheet = vi.fn();
    const onCancel = vi.fn();
    render(<BulkActionBar count={3} onOpenSheet={onOpenSheet} onCancel={onCancel} />);

    // 仕様 #61
    expect(screen.getByText("3日選択中")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "一括操作" }));
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(onOpenSheet).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("disables bulk action when nothing is selected", () => {
    render(<BulkActionBar count={0} onOpenSheet={vi.fn()} onCancel={vi.fn()} />);

    // 仕様 #61
    expect(screen.getByRole("button", { name: "一括操作" })).toBeDisabled();
  });
});
