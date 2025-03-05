const Redis = require("ioredis");

const redis = new Redis(
  "rediss://default:AVWVAAIncDI1Y2ExMTQwZDI3YjE0OTE2OWIxNjUzNmQ3NmQ3MWI1NXAyMjE5MDk@renewing-ewe-21909.upstash.io:6379",
  {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  },
);

redis
  .ping()
  .then((res) => console.log("✅ Redis Upstash OK:", res))
  .catch((err) => console.error("❌ Redis error:", err))
  .finally(() => redis.disconnect());
