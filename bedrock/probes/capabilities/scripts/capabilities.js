import * as mc from '@minecraft/server';
import { capabilityActions, runCapabilityProbeWithEngine } from './capabilities-core.js';

export { capabilityActions };

export async function runCapabilityProbe(request) {
  return runCapabilityProbeWithEngine(request, mc);
}
