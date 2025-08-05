import "dotenv/config";
import { createApp } from "./app";
import { logger } from "./config/logger";

const port = process.env.PORT || 3000;

const app = createApp();
app.listen(port, () => logger.info(`[WIM API] http://localhost:${port}`));
