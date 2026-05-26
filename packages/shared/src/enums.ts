export const ATTENDANCE_STATUS = ["PRESENT", "ABSENT", "EXCUSED", "TARDY", "EARLY_LEAVE", "CANCELLED"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUS)[number];

export const RULE_STRATEGY = ["COUNT_AS_PRESENT", "COUNT_AS_ABSENT", "HALF_PRESENT", "REDUCE_DENOMINATOR", "SEPARATE_COUNT"] as const;
export type RuleStrategy = (typeof RULE_STRATEGY)[number];

export const SCHOOL_KIND = ["UNIVERSITY", "JUNIOR_COLLEGE", "TECHNICAL_COLLEGE", "VOCATIONAL_SCHOOL", "HIGH_SCHOOL", "OTHER"] as const;
export type SchoolKind = (typeof SCHOOL_KIND)[number];

export const FRIENDSHIP_STATUS = ["PENDING", "ACCEPTED", "DECLINED", "BLOCKED"] as const;
export type FriendshipStatus = (typeof FRIENDSHIP_STATUS)[number];

export const ROOM_ROLE = ["OWNER", "MEMBER"] as const;
export type RoomRole = (typeof ROOM_ROLE)[number];
