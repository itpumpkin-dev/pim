import { afterEach } from 'vitest';

// vitest.config.ts doesn't enable `test.globals`, so @testing-library/react's
// own automatic afterEach(cleanup) (which only registers itself when it
// detects globals) never fires — without this, renderHook()/render() from an
// earlier test in the same file stays mounted (its effects' event listeners,
// timers, etc. included) into every later test in that file.
afterEach(async () => {
    if (typeof document === 'undefined') {
        return;
    }

    const { cleanup } = await import('@testing-library/react');
    cleanup();
});
