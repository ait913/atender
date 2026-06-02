import type { Prisma } from "@prisma/client";

export async function migrateCourseRoomToMeeting(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`
    UPDATE "Meeting"
    SET "room" = (SELECT "Course"."room" FROM "Course" WHERE "Course"."id" = "Meeting"."courseId")
    WHERE "room" IS NULL
  `;
  await tx.$executeRaw`
    UPDATE "TemplateMeeting"
    SET "room" = (SELECT "TemplateCourse"."room" FROM "TemplateCourse" WHERE "TemplateCourse"."id" = "TemplateMeeting"."courseId")
    WHERE "room" IS NULL
  `;
}
