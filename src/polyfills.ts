// Must be the first import in the entry point. `cheerio`'s dependency
// (undici@7) references the global `File` at module-load time, which Node
// only provides as a global starting in v20 — under Node 18 (still in use
// in production as of this writing) the process crashes on startup with
// "ReferenceError: File is not defined" before the app even binds a port.
// `node:buffer` has exported `File` since Node 18, just not as a global.
import { File } from "node:buffer";

if (typeof globalThis.File === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).File = File;
}
