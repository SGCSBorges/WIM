import express from "express";

const app = express();
const port = process.env.PORT || 3000;

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "WIM API" });
});

app.listen(port, () => {
  console.log(`[WIM API] running on http://localhost:${port}`);
});
