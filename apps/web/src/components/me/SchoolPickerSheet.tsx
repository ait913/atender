import type { SchoolDto } from "@atender/shared";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { SchoolSearch } from "@/components/templates/SchoolSearch";

export function SchoolPickerSheet({ open, value, onSelect, onClose }: { open: boolean; value: SchoolDto | null; onSelect: (school: SchoolDto) => void; onClose: () => void }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="学校を選ぶ">
      <SchoolSearch value={value} onChange={(school) => { if (school) { onSelect(school); onClose(); } }} />
    </BottomSheet>
  );
}
