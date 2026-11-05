/**
 * `npm run check:scene` — the geometric audit, as a report.
 *
 * Offline: prop bounds come from the glTF accessors, not from a renderer,
 * so this runs in milliseconds and needs no browser. The same `auditScene`
 * backs `tests/skyline-audit.test.ts`, which gates on errors.
 */
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { auditScene, formatAudit } = await server.ssrLoadModule('/src/levels/skyline/audit.ts');
const { propLookup } = await server.ssrLoadModule('/tools/scene-bounds.ts');

const findings = auditScene(propLookup());
console.log(formatAudit(findings));
await server.close();
process.exit(findings.some((f) => f.severity === 'error') ? 1 : 0);
