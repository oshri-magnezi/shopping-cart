import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The bot keeps its own copy of the matcher so it can run without the site's
 * build. Nothing but this test stops the two from drifting, and a drift would
 * be invisible: the site and the bot would simply start disagreeing about
 * which product a name refers to.
 */
describe('shared Hebrew matcher', () => {
  it('is byte-identical in the site and the bot', () => {
    const site = readFileSync('src/utils/hebrew.js');
    const bot = readFileSync('bot/src/match/hebrew.js');
    expect(bot.equals(site)).toBe(true);
  });
});
