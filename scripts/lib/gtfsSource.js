// A GTFS "source" is either a .zip feed (the real-world case) or a plain
// directory of GTFS .txt files (used by the synthetic test fixture, so tests
// don't need a zip library at all). Both stream rows without loading an
// entire file into memory.

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "csv-parse";
import { streamGtfsRows as streamZipRows } from "./gtfsZip.js";

async function* streamDirRows(dirPath, entryName, { optional = false } = {}) {
  const filePath = join(dirPath, entryName);
  try {
    await stat(filePath);
  } catch (err) {
    if (optional && err.code === "ENOENT") return;
    throw err;
  }
  const parser = createReadStream(filePath).pipe(
    parse({ columns: true, skip_empty_lines: true, trim: true })
  );
  for await (const record of parser) {
    yield record;
  }
}

export async function createGtfsSource(path) {
  const isDirectory = (await stat(path)).isDirectory();
  return {
    streamRows(entryName, opts) {
      return isDirectory ? streamDirRows(path, entryName, opts) : streamZipRows(path, entryName, opts);
    },
  };
}
