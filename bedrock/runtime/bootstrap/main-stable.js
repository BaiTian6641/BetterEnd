/**
 * BetterEnd Bedrock 26.40 — Stable Production Entrypoint (`stable-2640`).
 *
 * Uses only `@minecraft/server` 2.9.0 and `@minecraft/server-ui` 2.1.0.
 */

import * as serverModule from "@minecraft/server";
import * as uiModule from "@minecraft/server-ui";
import { createBetterEndRuntime } from "./bootstrap.js";

export const runtime = createBetterEndRuntime({
  serverModule,
  uiModule,
  graphicsModule: null,
  profile: "stable-2640"
});

export default runtime;
