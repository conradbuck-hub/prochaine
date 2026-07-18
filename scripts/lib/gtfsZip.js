// Streams a single CSV file out of a GTFS zip without loading the whole
// archive (or the whole CSV) into memory — stop_times.txt alone can be
// millions of rows across a multi-agency GTFS set.

import yauzl from "yauzl";
import { parse } from "csv-parse";

function openZipEntryStream(zipPath, entryName) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err);
      let found = false;
      zipfile.on("error", reject);
      zipfile.on("entry", (entry) => {
        if (entry.fileName === entryName) {
          found = true;
          zipfile.openReadStream(entry, (err, readStream) => {
            if (err) return reject(err);
            resolve(readStream);
          });
        } else {
          zipfile.readEntry();
        }
      });
      zipfile.on("end", () => {
        if (!found) reject(new Error(`${entryName} not found in ${zipPath}`));
      });
      zipfile.readEntry();
    });
  });
}

// Async-iterates parsed CSV rows (as plain objects, header-keyed) from a
// named entry inside a GTFS zip. Silently yields nothing if the file is
// absent and `optional` is true (not every agency publishes frequencies.txt).
export async function* streamGtfsRows(zipPath, entryName, { optional = false } = {}) {
  let readStream;
  try {
    readStream = await openZipEntryStream(zipPath, entryName);
  } catch (err) {
    if (optional) return;
    throw err;
  }
  const parser = readStream.pipe(parse({ columns: true, skip_empty_lines: true, trim: true }));
  for await (const record of parser) {
    yield record;
  }
}
