export const QK = {
  session: () => ["session"] as const,
  me: () => ["me"] as const,
  schools: (q: { q?: string; prefecture?: string; kind?: string }) => ["schools", q] as const,
  departments: (schoolId: string) => ["departments", schoolId] as const,
  semesters: () => ["semesters"] as const,
  semester: (id: string) => ["semesters", id] as const,
  templates: (q: { schoolId?: string; departmentId?: string; q?: string }) => ["templates", q] as const,
  template: (id: string) => ["templates", id] as const,
  userTimetables: () => ["user-timetables"] as const,
  userTimetable: (id: string) => ["user-timetables", id] as const,
  userTimetableBySemester: (semesterId?: string | null) => ["user-timetable-by-semester", semesterId ?? "default"] as const,
  courses: () => ["courses"] as const,
  meetings: () => ["meetings"] as const,
  today: (date?: string) => ["today", date ?? "current"] as const,
  stats: (semesterId: string) => ["stats", semesterId] as const,
  rules: (schoolId: string, departmentId: string) => ["rules", schoolId, departmentId] as const,
} as const;

export const QP = {
  templates: (q: { queryKey: readonly unknown[] }) => q.queryKey[0] === "templates",
  userTimetables: (q: { queryKey: readonly unknown[] }) => q.queryKey[0] === "user-timetables" || q.queryKey[0] === "user-timetable-by-semester",
  courses: (q: { queryKey: readonly unknown[] }) => q.queryKey[0] === "courses",
  meetings: (q: { queryKey: readonly unknown[] }) => q.queryKey[0] === "meetings",
  today: (q: { queryKey: readonly unknown[] }) => q.queryKey[0] === "today",
  stats: (q: { queryKey: readonly unknown[] }) => q.queryKey[0] === "stats",
  schools: (q: { queryKey: readonly unknown[] }) => q.queryKey[0] === "schools",
} as const;
