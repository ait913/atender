import type { UserTimetableDto } from "@atender/shared";

export type TimetablePublishAction =
  | { kind: "none" }
  | { kind: "publish"; title: string }
  | { kind: "unpublish"; templateId: string };

export function initialToggle(timetable: UserTimetableDto | null): boolean {
  if (timetable == null) return false;
  return timetable.publishedTemplate?.isPublic ?? timetable.sourceTemplateId == null;
}

export function action(toggle: boolean, title: string, timetable: UserTimetableDto): TimetablePublishAction {
  if (toggle) return timetable.meetings.length === 0 ? { kind: "none" } : { kind: "publish", title };
  return timetable.publishedTemplate?.isPublic === true
    ? { kind: "unpublish", templateId: timetable.publishedTemplate.id }
    : { kind: "none" };
}
