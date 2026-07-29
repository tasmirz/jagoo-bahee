import { afterEach, describe, expect, it } from 'vitest';
import { integrationUrl } from './integration-env.js';

/**
 * CLAUDE.md §7.4: every gate needs a test that makes it fail on purpose, and a compliant
 * control that still passes. Otherwise all you have proved is that the tool dislikes the
 * directory.
 *
 * The gate under test is the admission rule itself — the thing that decides whether the
 * mandatory Mongo/Redis suites are allowed to skip. It regressed once by being absent
 * (build log L-11), so it is now exercised directly.
 */
describe('integration gate admission', () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
  });

  it('L-11 — a missing URL is fatal, not a skip, when the gate is declared mandatory', () => {
    process.env.JB_REQUIRE_INTEGRATION = '1';
    delete process.env.JB_TEST_URL;

    expect(() => integrationUrl('JB_TEST_URL')).toThrow(/JB_TEST_URL is required/);
  });

  it('L-11 — a blank URL counts as missing', () => {
    process.env.JB_REQUIRE_INTEGRATION = '1';
    process.env.JB_TEST_URL = '   ';

    expect(() => integrationUrl('JB_TEST_URL')).toThrow(/JB_TEST_URL is required/);
  });

  it('control — a present URL is returned trimmed and the suite runs', () => {
    process.env.JB_REQUIRE_INTEGRATION = '1';
    process.env.JB_TEST_URL = ' redis://127.0.0.1:6379/15 ';

    expect(integrationUrl('JB_TEST_URL')).toBe('redis://127.0.0.1:6379/15');
  });

  it('control — without the flag, absence yields null so local runs skip honestly', () => {
    delete process.env.JB_REQUIRE_INTEGRATION;
    delete process.env.JB_TEST_URL;

    expect(integrationUrl('JB_TEST_URL')).toBeNull();
  });
});
