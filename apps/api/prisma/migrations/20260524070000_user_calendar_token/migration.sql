-- Capability token for the read-only iCalendar feed.
ALTER TABLE "User" ADD COLUMN "calendarToken" VARCHAR(64);
CREATE UNIQUE INDEX "User_calendarToken_key" ON "User"("calendarToken");
