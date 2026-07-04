import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const outputDir = ".vercel/output";
const functionDir = join(outputDir, "functions/__server.func");

await rm(outputDir, { recursive: true, force: true });
await mkdir(join(outputDir, "static"), { recursive: true });
await mkdir(functionDir, { recursive: true });

await cp("dist/client", join(outputDir, "static"), { recursive: true });
await cp("dist/server", join(functionDir, "server"), { recursive: true });

await writeFile(
  join(outputDir, "config.json"),
  JSON.stringify(
    {
      version: 3,
      routes: [{ handle: "filesystem" }, { src: "/(.*)", dest: "/__server" }],
    },
    null,
    2,
  ),
);

await writeFile(
  join(functionDir, ".vc-config.json"),
  JSON.stringify(
    {
      handler: "index.mjs",
      launcherType: "Nodejs",
      shouldAddHelpers: false,
      supportsResponseStreaming: true,
      runtime: "nodejs24.x",
    },
    null,
    2,
  ),
);

await writeFile(
  join(functionDir, "index.mjs"),
  `import server from "./server/server.js";

export default {
  async fetch(request, context) {
    return server.fetch(request, {}, context);
  },
};
`,
);
