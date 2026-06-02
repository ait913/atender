import { render, screen } from "@testing-library/react";
import { SettingsSection } from "@/components/settings/SettingsSection";

describe("SettingsSection", () => {
  it("uses the thin settings panel treatment", () => {
    render(
      <SettingsSection title="テーマ">
        <div>自動</div>
        <div>ライト</div>
      </SettingsSection>,
    );

    const title = screen.getByText("テーマ");
    const panel = screen.getByText("自動").parentElement as HTMLElement;

    expect(title.className).toContain("text-[11px]");
    expect(title.className).toContain("font-semibold");
    expect(panel.className).toContain("rounded-lg");
    expect(panel.className).toContain("border");
    expect(panel.className).toContain("divide-y");
    expect(panel.className).toContain("divide-border-subtle");
    expect(panel.className).not.toContain("rounded-2xl");
    expect(panel.className).not.toContain("shadow-card");
    expect(panel.style.borderColor).toBe("var(--border-settings)");
    expect(panel.style.boxShadow).toBe("var(--shadow-settings-panel)");
    expect(panel.style.background).toBe("var(--color-bg-elevated)");
  });
});
