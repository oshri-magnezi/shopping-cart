import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isTransient, withRetries } from '../src/retry.js';

/**
 * The retry exists because the bot is fail-soft: a chain that throws once is
 * dropped, the run still reports success, and a shop quietly vanishes from
 * every basket until somebody notices weeks later. So the cases that matter
 * are the boundaries — it must not give up early, must not retry something
 * that will fail identically, and must not change what a working call does.
 */

// No real waiting: the seam is there so these run in microseconds.
const immediately = async () => {};

describe('withRetries', () => {
  it('does not touch a call that works', async () => {
    let calls = 0;
    const result = await withRetries(
      async () => {
        calls += 1;
        return 'value';
      },
      { wait: immediately },
    );

    assert.equal(result, 'value');
    assert.equal(calls, 1);
  });

  it('returns the first success after a stumble', async () => {
    let calls = 0;
    const result = await withRetries(
      async () => {
        calls += 1;
        if (calls < 3) throw new Error('timeout');
        return 'value';
      },
      { wait: immediately },
    );

    assert.equal(result, 'value');
    assert.equal(calls, 3);
  });

  it('gives up after the last attempt and re-throws untouched', async () => {
    // The message has to survive: the caller logs it and the operator reads it.
    let calls = 0;
    await assert.rejects(
      withRetries(
        async () => {
          calls += 1;
          throw new Error('timeout of 30000ms exceeded');
        },
        { attempts: 3, wait: immediately },
      ),
      /timeout of 30000ms exceeded/,
    );
    assert.equal(calls, 3);
  });

  it('stops immediately on an error that will not change', async () => {
    let calls = 0;
    await assert.rejects(
      withRetries(
        async () => {
          calls += 1;
          throw new Error('HTTP 404');
        },
        { shouldRetry: isTransient, wait: immediately },
      ),
      /404/,
    );
    assert.equal(calls, 1, 'a 404 says the same thing three times');
  });

  it('backs off further each time', async () => {
    const waits = [];
    await assert.rejects(
      withRetries(async () => { throw new Error('timeout'); }, {
        attempts: 4,
        delayMs: 100,
        factor: 2,
        wait: async (ms) => { waits.push(ms); },
      }),
    );

    assert.deepEqual(waits, [100, 200, 400]);
  });

  it('reports each retry so a flaky chain is visible in the log', async () => {
    // A chain that needs two goes every single night is a fetcher that wants
    // fixing, and this log line is the only place that pattern shows up.
    const seen = [];
    await withRetries(
      async (attempt) => {
        if (attempt < 2) throw new Error('socket hang up');
        return 'ok';
      },
      { onRetry: (error, attempt) => seen.push([attempt, error.message]), wait: immediately },
    );

    assert.deepEqual(seen, [[1, 'socket hang up']]);
  });

  it('runs once when told to', async () => {
    let calls = 0;
    await assert.rejects(
      withRetries(async () => { calls += 1; throw new Error('timeout'); }, {
        attempts: 1,
        wait: immediately,
      }),
    );
    assert.equal(calls, 1);
  });
});

describe('isTransient', () => {

  const transient = [
    'timeout of 30000ms exceeded',
    'socket hang up',
    'read ECONNRESET',
    'ההורדה נכשלה עם HTTP 503',
    'HTTP 429',
    'net::ERR_CONNECTION_CLOSED',
    'Navigation timeout',
    'Target closed',
    'הקובץ שהתקבל ריק',
  ];
  for (const message of transient) {
    it(`retries "${message}"`, () => {
      assert.equal(isTransient(new Error(message)), true);
    });
  }

  const permanent = [
    'ההורדה נכשלה עם HTTP 404',
    'לא נמצא סניף של חצי חינם בעיר "חיפה"',
    'Unexpected end of XML input',
    'ENOENT: no such file or directory',
  ];
  for (const message of permanent) {
    it(`does not retry "${message}"`, () => {
      assert.equal(isTransient(new Error(message)), false);
    });
  }

  it('survives something that is not an Error at all', () => {
    assert.equal(isTransient(undefined), false);
    assert.equal(isTransient('timeout'), true);
  });
});
