// Diagnostic: dump the field metadata of the generated Garantie model so
// a contributor can see exactly what Prisma exposes without running tsc.
// CommonJS so it works against the compiled client without ts-node.
const { PrismaClient } = require("@prisma/client");

async function main() {
  const p = new PrismaClient();
  // Prisma delegates don't expose fields directly; print a sample record keys.
  const one = await p.garantie.findFirst();
  console.log(one ? Object.keys(one).sort() : "no garantie rows");
  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
