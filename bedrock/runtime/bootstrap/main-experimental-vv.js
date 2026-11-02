/**
 * BetterEnd Bedrock 26.40 — Experimental Vibrant Visuals Entrypoint (`experimental-2640`).
 *
 * Uses `@minecraft/server` 2.9.0, `@minecraft/server-ui` 2.1.0, and
 * `@minecraft/server-graphics` 1.0.0-beta.
 */

import * as serverModule from "@minecraft/server";
import * as uiModule from "@minecraft/server-ui";
import * as graphicsModule from "@minecraft/server-graphics";
import { createBetterEndRuntime } from "./bootstrap.js";

export const runtime = createBetterEndRuntime({
  serverModule,
  uiModule,
  graphicsModule,
  profile: "experimental-2640"
});

export default runtime;
