import express from "express";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { TTLCache } from "./services/cache.js";
import { loadStopIndex, loadScheduleIndex } from "./services/dataStore.js";
import { createChatRouter } from "./routes/chat.js";
import { createDebugRouter } from "./routes/debug.js";

const compiledDataDir = new URL("./data/compiled/", import.meta.url);
const profilePath = fileURLToPath(new URL("./data/user-profile.json", import.meta.url));
const publicDir = fileURLToPath(new URL("../public/", import.meta.url));

const stopIndex = await loadStopIndex(compiledDataDir);
const scheduleIndex = await loadScheduleIndex(compiledDataDir);
const cache = new TTLCache();

const app = express();
app.use(express.json());
app.use(express.static(publicDir));

app.use(createChatRouter({ config, cache, stopIndex, scheduleIndex, profilePath }));
app.use(createDebugRouter({ config, cache, stopIndex, scheduleIndex }));

app.get("/health", (req, res) => {
  res.json({ ok: true, stops: stopIndex.length });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

app.listen(config.port, () => {
  console.log(`Prochaine listening on :${config.port} (${stopIndex.length} stops loaded)`);
});
