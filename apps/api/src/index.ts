import pino from "pino";
import { createApp } from "./app";

const logger = pino({ transport: { target: "pino-pretty" } });
const port = process.env.PORT || 3000;

const app = createApp();
app.listen(port, () => logger.info(`[WIM API] http://localhost:${port}`));
