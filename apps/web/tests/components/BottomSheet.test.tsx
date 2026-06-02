import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";

import { BottomSheet } from "@/components/sheet/BottomSheet";

function numericZIndex(element: Element) {
  const html = element as HTMLElement;
  const raw = html.style.zIndex || html.getAttribute("style") || html.getAttribute("class") || "";
  const match = raw.match(/z-\[(\d+)\]|z-(\d+)|z-index:\s*(\d+)|^(\d+)$/);
  return match ? Number(match[1] ?? match[2] ?? match[3] ?? match[4]) : null;
}

function zIndexes() {
  const fromHtml = Array.from(document.body.innerHTML.matchAll(/z-\[(\d+)\]/g), match => Number(match[1]));
  if (fromHtml.length > 0) return fromHtml;
  return Array.from(document.querySelectorAll("[style], [class]"))
    .map(numericZIndex)
    .filter((value): value is number => value !== null);
}

describe("BottomSheet", () => {
  it("[仕様38] stackLevel=2 の BottomSheet は stackLevel=1 より高い z-index を持つ", () => {
    render(
      <>
        <BottomSheet open onClose={vi.fn()} title="下の Sheet" stackLevel={1}>
          <div>level 1 body</div>
        </BottomSheet>
        <BottomSheet open onClose={vi.fn()} title="上の Sheet" stackLevel={2}>
          <div>level 2 body</div>
        </BottomSheet>
      </>,
    );

    const values = zIndexes();
    expect(values).toEqual(expect.arrayContaining([1100, 1110, 1120, 1130]));
    expect(Math.max(...values.filter(value => value < 1120))).toBeLessThan(Math.min(...values.filter(value => value >= 1120)));
  });

  it("[仕様39] ネストした 2 枚を開いた状態で、上の Sheet を閉じると下の Sheet が残る", () => {
    function NestedSheets() {
      const [topOpen, setTopOpen] = useState(true);
      return (
        <>
          <BottomSheet open onClose={vi.fn()} title="下の Sheet" stackLevel={1}>
            <div>下の内容</div>
          </BottomSheet>
          <BottomSheet open={topOpen} onClose={() => setTopOpen(false)} title="上の Sheet" stackLevel={2}>
            <button type="button" onClick={() => setTopOpen(false)}>上を閉じる</button>
          </BottomSheet>
        </>
      );
    }

    render(<NestedSheets />);
    expect(screen.getByText("下の内容")).toBeInTheDocument();
    expect(screen.getByText("上を閉じる")).toBeInTheDocument();

    fireEvent.click(screen.getByText("上を閉じる"));

    expect(screen.getByText("下の内容")).toBeInTheDocument();
    expect(screen.queryByText("上を閉じる")).not.toBeInTheDocument();
  });
});
