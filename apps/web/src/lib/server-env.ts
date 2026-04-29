import { parseServerEnvironment, type ServerEnvironment } from "@realty-ops/core";
import { mergeLocalEnvFallback } from "./local-env";

export function getServerEnvironment(input: NodeJS.ProcessEnv = process.env): ServerEnvironment {
  return parseServerEnvironment(mergeLocalEnvFallback(input));
}
