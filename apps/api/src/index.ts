import "dotenv/config";
import { validateEnv } from "./utils/validate-env";
import { createApp } from "./app";
import { logger } from "./config/logger";

validateEnv();

const port = process.env.PORT || 3000;

const app = createApp();
app.listen(port, () => logger.info(`[WIM API] listening on port ${port}`));
