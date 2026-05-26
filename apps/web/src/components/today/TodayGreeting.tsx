import dayjs from "dayjs";
import type { MeResponse } from "@/api/hooks/types";
import { Mascot } from "@/components/ui";

const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

export function TodayGreeting({ me, date }: { me?: MeResponse; date: string }) {
  const d = dayjs(date);
  return (
    <header className="flex items-center gap-3">
      <Mascot className="h-16 w-16" />
      <div>
        <p className="text-2xl font-bold">{d.format("M月D日")}({weekdays[d.day()]})</p>
        <p className="text-sm text-fg-secondary">こんにちは {me?.user.name ?? me?.user.email ?? "Atender"} さん</p>
      </div>
    </header>
  );
}
