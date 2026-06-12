export type SetupFields = {
  schoolId: string | null;
  departmentId: string | null;
  defaultSemesterId: string | null;
};

/** セットアップ完了の単一判定。timetable は完了要件に含めない (Home 内で作る)。 */
export function isSetupComplete(user: SetupFields): boolean {
  return user.schoolId != null && user.departmentId != null && user.defaultSemesterId != null;
}
