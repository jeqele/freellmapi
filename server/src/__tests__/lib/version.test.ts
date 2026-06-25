import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getAppVersion } from '../../version.js';

describe('getAppVersion', () => {
  const prev = process.env.FREEAPI_VERSION;

  beforeEach(() => {
    delete process.env.FREEAPI_VERSION;
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.FREEAPI_VERSION;
    else process.env.FREEAPI_VERSION = prev;
  });

  it('prefers FREEAPI_VERSION env', () => {
    process.env.FREEAPI_VERSION = '0.4.1';
    expect(getAppVersion()).toBe('0.4.1');
  });

  it('falls back to server package.json or unknown', () => {
    const v = getAppVersion();
    expect(v === 'unknown' || /^\d+\.\d+\.\d+/.test(v)).toBe(true);
  });
});
