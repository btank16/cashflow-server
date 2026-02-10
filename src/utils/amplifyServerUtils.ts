import { createServerRunner } from "@aws-amplify/adapter-nextjs";
import { existsSync } from "fs";
import { join } from "path";

let runWithAmplifyServerContext: ReturnType<
  typeof createServerRunner
>["runWithAmplifyServerContext"];

const outputsPath = join(process.cwd(), "amplify_outputs.json");
if (existsSync(outputsPath)) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const outputs = require(outputsPath);
  const runner = createServerRunner({ config: outputs });
  runWithAmplifyServerContext = runner.runWithAmplifyServerContext;
}

export { runWithAmplifyServerContext };
