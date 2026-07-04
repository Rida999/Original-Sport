import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { nodeFileTrace } from "@vercel/nft";

const outputDir = ".vercel/output";
const functionDir = join(outputDir, "functions/__server.func");
const serverEntry = "dist/server/server.js";

await rm(outputDir, { recursive: true, force: true });
await mkdir(join(outputDir, "static"), { recursive: true });
await mkdir(functionDir, { recursive: true });

await cp("dist/client", join(outputDir, "static"), { recursive: true });

const { fileList } = await nodeFileTrace([serverEntry], {
  base: process.cwd(),
  processCwd: process.cwd(),
});

await Promise.all(
  Array.from(fileList).map(async (file) => {
    await mkdir(join(functionDir, dirname(file)), { recursive: true });
    await cp(file, join(functionDir, file), { recursive: true });
  }),
);

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
  `import server from "./dist/server/server.js";

export default {
  async fetch(request, context) {
    return server.fetch(request, {}, context);
  },
};
`,
);
