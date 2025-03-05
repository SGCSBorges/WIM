import pino from "pino";
import "dotenv/config";
import { createApp } from "./app";
import { startWorkers } from "./jobs/workers";

const logger = pino({ transport: { target: "pino-pretty" } });
const port = process.env.PORT || 3000;

const app = createApp();
startWorkers();
app.listen(port, () => logger.info(`[WIM API] http://localhost:${port}`));
