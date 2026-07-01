# Model Sync

Last synced: 2026-06-26

| Swift type | Source schema |
|---|---|
| `MeResponse` | `packages/shared/src/schemas/me.ts` `MeResponseDto` |
| `SetupStatus` | `packages/shared/src/schemas/me.ts` `MeResponseDto.setupStatus` |
| `SemesterDto` | `packages/shared/src/schemas/semester.ts` `SemesterDto` |
| `SemesterOverviewDto` | `packages/shared/src/schemas/semester.ts` `SemesterOverviewDto` |
| `AttendanceRateToDate` | `packages/shared/src/schemas/stats.ts` `CourseStatsDto.toDate`; `packages/shared/src/schemas/semester.ts` `SemesterOverviewDto.overall.toDate` |
| `AttendanceDaySummary` | `packages/shared/src/schemas/semester.ts` `AttendanceDaySummary` |
| `CourseStatsDto` | `packages/shared/src/schemas/stats.ts` `CourseStatsDto` |
| `UserTimetableDto` | `packages/shared/src/schemas/userTimetable.ts` `UserTimetableDto` |
| `UserTimetableListResponse` | `apps/api/src/routes/userTimetables.ts` `GET /api/user-timetables` |
| `DaySlotDto` | `packages/shared/src/schemas/template.ts` `DaySlotDto` |
| `CourseDto` | `packages/shared/src/schemas/template.ts` `CourseDto` |
| `MeetingDto` | `packages/shared/src/schemas/template.ts` `MeetingDto` |
| `OccurrenceDto` | `packages/shared/src/schemas/attendance.ts` `OccurrenceDto` |
| `TodayResponse` | `packages/shared/src/schemas/attendance.ts` `TodayResponse` |
| `MarkAttendanceInput` | `packages/shared/src/schemas/attendance.ts` `MarkAttendanceInput` |
| `MarkAllPresentInput` | `packages/shared/src/schemas/attendance.ts` `MarkAllPresentInput` |
| `MarkAllPresentResponse` | `packages/shared/src/schemas/attendance.ts` `MarkAllPresentResponse` |
| `AttendanceStatus` | `packages/shared/src/enums.ts` `ATTENDANCE_STATUS` |
| `ErrorResponse` | `packages/shared/src/schemas/api.ts` `ErrorResponse` |

Dates are kept as `String` in Swift. ISO date-time strings and `YYYY-MM-DD` local dates are parsed only at display/calculation boundaries.
