/**
 * Promote a user to ADMIN by email.
 *
 * Usage (locally or via Render shell):
 *   ts-node src/scripts/promote-to-admin.ts you@example.com
 *
 * Or with the compiled build:
 *   node dist/scripts/promote-to-admin.js you@example.com
 *
 * No-ops if the user is already ADMIN. Exits non-zero if the email is not
 * found, so you can safely chain it in a deploy script.
 */

import "dotenv/config";
import { prisma } from "../libs/prisma";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error("usage: promote-to-admin <email>");
    process.exit(2);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No user with email "${email}".`);
    process.exit(1);
  }

  if (user.role === "ADMIN") {
    console.log(`User ${email} is already ADMIN — no change.`);
    return;
  }

  await prisma.user.update({
    where: { userId: user.userId },
    data: { role: "ADMIN" },
  });

  console.log(
    `Promoted ${email} (userId=${user.userId}) ${user.role} → ADMIN.`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
