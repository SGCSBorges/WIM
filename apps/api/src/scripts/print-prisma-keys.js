// Tiny helper to inspect Prisma model accessors
const { PrismaClient } = require("@prisma/client");

async function main() {
  const p = new PrismaClient();
  const keys = Object.keys(p)
    .filter((k) => !k.startsWith("_") && !k.startsWith("$"))
    .sort();
  console.log(keys.join("\n"));
  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
