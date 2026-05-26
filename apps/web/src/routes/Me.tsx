import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { CourseDto, MeUpdateInput, SemesterDto } from "@atender/shared";
import { ApiError } from "@/api/client";
import { useDeleteCourse, useDeleteSemester, useDepartments, useMe, usePatchMe, useSchools, useSemesters, useSignOut, useUserTimetable } from "@/api/hooks";
import { AttendanceRuleSheet } from "@/components/me/AttendanceRuleSheet";
import { CourseEditorSheet } from "@/components/me/CourseEditorSheet";
import { DepartmentPickerSheet } from "@/components/me/DepartmentPickerSheet";
import { SchoolPickerSheet } from "@/components/me/SchoolPickerSheet";
import { SemesterCreateSheet } from "@/components/me/SemesterCreateSheet";
import { SemesterEditSheet } from "@/components/me/SemesterEditSheet";
import { Button } from "@/components/ui";

export function Me() {
  const navigate = useNavigate();
  const me = useMe();
  const patchMe = usePatchMe();
  const schools = useSchools({});
  const semesters = useSemesters();
  const user = me.data?.user;
  const departments = useDepartments(user?.schoolId);
  const currentSemesterId = user?.defaultSemesterId ?? undefined;
  const timetable = useUserTimetable(currentSemesterId);
  const signOutMutation = useSignOut();
  const [schoolOpen, setSchoolOpen] = useState(false);
  const [departmentOpen, setDepartmentOpen] = useState(false);
  const [semesterCreate, setSemesterCreate] = useState(false);
  const [semesterEdit, setSemesterEdit] = useState<SemesterDto | null>(null);
  const [courseEdit, setCourseEdit] = useState<CourseDto | null | "new">(null);
  const [ruleType, setRuleType] = useState<"default" | "user" | null>(null);
  const [semesterDeleteError, setSemesterDeleteError] = useState<string | null>(null);
  const initial = (user?.name ?? user?.email ?? "A").slice(0, 1).toUpperCase();
  const school = schools.data?.schools.find((item) => item.id === user?.schoolId) ?? null;
  const department = departments.data?.departments.find((item) => item.id === user?.departmentId) ?? null;
  const courses = timetable.data?.userTimetable?.courses ?? [];

  function signOut() {
    signOutMutation.mutate(undefined, { onSettled: () => void navigate({ to: "/signin" }) });
  }

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-6 pb-tab-safe md:px-6">
      <section className="flex items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-100 text-xl font-bold text-accent-700">{initial}</div>
        <div>
          <p className="font-semibold">{user?.name ?? "Atender"}</p>
          <p className="text-sm text-fg-secondary">{user?.email}</p>
        </div>
      </section>
      <section className="grid gap-2">
        <h2 className="text-sm font-semibold text-fg-secondary">所属</h2>
        <Row label="学校" value={school?.name ?? (user?.schoolId ? "読み込み中" : "未設定")} action="編集" onClick={() => setSchoolOpen(true)} />
        <Row label="学科" value={department?.name ?? (user?.departmentId ? "読み込み中" : "未設定")} action="編集" onClick={() => setDepartmentOpen(true)} />
      </section>
      <section className="grid gap-2">
        <h2 className="text-sm font-semibold text-fg-secondary">学期</h2>
        {semesters.data?.semesters.map((semester) => (
          <SemesterRow
            key={semester.id}
            semester={semester}
            isCurrent={user?.defaultSemesterId === semester.id}
            onEdit={() => setSemesterEdit(semester)}
            onDeleteError={setSemesterDeleteError}
          />
        ))}
        {semesterDeleteError ? <p className="text-sm font-semibold text-status-absent">{semesterDeleteError}</p> : null}
        <Button variant="secondary" onClick={() => setSemesterCreate(true)}>+ 学期を追加</Button>
      </section>
      <section className="grid gap-2">
        <h2 className="text-sm font-semibold text-fg-secondary">科目</h2>
        {courses.map((course) => (
          <CourseRow
            key={course.id}
            course={course}
            userTimetableId={timetable.data?.userTimetable?.id}
            semesterId={currentSemesterId}
            onEdit={() => setCourseEdit(course)}
          />
        ))}
        <Button variant="secondary" disabled={!currentSemesterId || !timetable.data?.userTimetable?.id} onClick={() => setCourseEdit("new")}>+ 科目を追加</Button>
      </section>
      <section className="grid gap-2">
        <h2 className="text-sm font-semibold text-fg-secondary">出欠ルール</h2>
        <Row label="学校・学科のデフォルト" value="" action="編集" onClick={() => setRuleType("default")} />
        <Row label="自分の上書き" value="" action="編集" onClick={() => setRuleType("user")} />
      </section>
      <section className="grid gap-2">
        <h2 className="text-sm font-semibold text-fg-secondary">アカウント</h2>
        <Button variant="secondary" onClick={() => void signOut()}>ログアウト</Button>
        <Button variant="destructive" disabled title="準備中">アカウントを削除</Button>
      </section>
      <SchoolPickerSheet open={schoolOpen} value={school} onClose={() => setSchoolOpen(false)} onSelect={(selectedSchool) => patchMe.mutate({ schoolId: selectedSchool.id, departmentId: null } as unknown as MeUpdateInput)} />
      <DepartmentPickerSheet open={departmentOpen} schoolId={user?.schoolId} onClose={() => setDepartmentOpen(false)} onSelect={(department) => patchMe.mutate({ schoolId: user?.schoolId ?? undefined, departmentId: department.id })} />
      <SemesterCreateSheet open={semesterCreate} onClose={() => setSemesterCreate(false)} />
      <SemesterEditSheet open={semesterEdit != null} semester={semesterEdit} onClose={() => setSemesterEdit(null)} />
      <CourseEditorSheet open={courseEdit != null} onClose={() => setCourseEdit(null)} userTimetableId={timetable.data?.userTimetable?.id} semesterId={currentSemesterId} course={courseEdit === "new" ? null : courseEdit} />
      <AttendanceRuleSheet open={ruleType != null} onClose={() => setRuleType(null)} schoolId={user?.schoolId} departmentId={user?.departmentId} type={ruleType ?? "user"} />
    </div>
  );
}

function Row({ label, value, action, onClick, destructiveAction, onDestructive }: { label: string; value: string; action: string; onClick: () => void; destructiveAction?: string; onDestructive?: () => void }) {
  return (
    <div className="flex min-h-12 items-center gap-3 rounded-md border border-border-subtle bg-bg-elevated px-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{label}</p>
        {value ? <p className="truncate text-sm text-fg-secondary">{value}</p> : null}
      </div>
      <Button size="sm" variant="ghost" onClick={onClick}>{action}</Button>
      {destructiveAction && onDestructive ? <Button size="sm" variant="ghost" onClick={onDestructive}>{destructiveAction}</Button> : null}
    </div>
  );
}

function SemesterRow({
  semester,
  isCurrent,
  onEdit,
  onDeleteError,
}: {
  semester: SemesterDto;
  isCurrent: boolean;
  onEdit: () => void;
  onDeleteError: (message: string | null) => void;
}) {
  const deleteSemester = useDeleteSemester(semester.id);

  function onDelete() {
    onDeleteError(null);
    if (!window.confirm(`${semester.name} を削除しますか?`)) return;
    deleteSemester.mutate(undefined, {
      onSuccess: () => onDeleteError(null),
      onError: (error) => {
        onDeleteError(error instanceof ApiError && error.status === 409 ? "先に時間割を削除してください" : "削除できませんでした");
      },
    });
  }

  return (
    <Row
      label={semester.name}
      value={isCurrent ? "現在" : ""}
      action="編集"
      onClick={onEdit}
      destructiveAction="削除"
      onDestructive={onDelete}
    />
  );
}

function CourseRow({
  course,
  userTimetableId,
  semesterId,
  onEdit,
}: {
  course: CourseDto;
  userTimetableId?: string;
  semesterId?: string;
  onEdit: () => void;
}) {
  const deleteCourse = useDeleteCourse(course.id, userTimetableId, semesterId);
  const deleteCourseCascade = useDeleteCourse(course.id, userTimetableId, semesterId, true);

  function onDelete() {
    if (!window.confirm(`${course.name} を削除しますか?`)) return;
    deleteCourse.mutate(undefined, {
      onError: (error) => {
        if (error instanceof ApiError && error.status === 409 && window.confirm("関連の授業も削除しますか?")) {
          deleteCourseCascade.mutate();
        }
      },
    });
  }

  return (
    <Row
      label={course.name}
      value={course.teacher ?? ""}
      action="編集"
      onClick={onEdit}
      destructiveAction="削除"
      onDestructive={onDelete}
    />
  );
}
