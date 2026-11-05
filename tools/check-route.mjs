/** Offline route generation; no server socket and no browser required. */
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
try {
  const { solve, formatSolve, probeTiming, transitionCosts } = await server.ssrLoadModule('/src/levels/skyline/solve.ts');
  const result = solve();
  console.log(formatSolve(result));
  if ('failure' in result) {
    process.exitCode = 1;
  } else {
    console.log('\nTransition durations (largest of 16 sampled phases):');
    for (const [name, cost] of Object.entries(transitionCosts())) console.log(`  ${name}: ${cost.toFixed(3)}s`);
    const timing = probeTiming(result.solution.swipes);
    console.log(`\nSingle-swipe timing probes: ${timing.early.toFixed(1)}s early / ${timing.late.toFixed(1)}s late`);
    console.log(`  Tested in ${timing.step.toFixed(1)}s steps, capped at ${timing.limit.toFixed(1)}s, preserving swipe order.`);
    console.log(`  Early probe stopped by ${timing.stoppedBy.early}; late probe stopped by ${timing.stoppedBy.late}.`);
    console.log('  Each input shifted individually; this is a sampled margin, not an exact boundary.');
    console.log(`  Combined variation: ${timing.jitter.passed}/${timing.jitter.trials} seeded trials passed with ±${timing.jitter.amplitude.toFixed(1)}s per swipe.`);
    console.log('  Untested combinations and human play are not certified.');
    if (timing.firstFailure) {
      const { swipe, offset, outcome } = timing.firstFailure;
      const input = result.solution.swipes[swipe];
      console.log(`  First failed probe: ${input.direction} at ${input.time.toFixed(2)}s shifted ${offset.toFixed(1)}s;` +
        ` struck [${outcome.struck.join(', ')}], missed [${outcome.missed.join(', ')}]`);
    }
    console.log('\nGenerated inputs:');
    for (const s of result.solution.swipes) console.log(`  ${s.time.toFixed(3).padStart(7)}s  ${s.direction}`);
  }
} finally {
  await server.close();
}
