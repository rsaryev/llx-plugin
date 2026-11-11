import { describe, expect, test } from 'bun:test';
import { createBudget } from '../../src/foundation/index.ts';
import { fixedClock } from '../support/ports.ts';

describe('createBudget', () => {
  test('runs from creation: remainingMs falls with the clock and expired resolves at the limit', async () => {
    const clock = fixedClock();
    const budget = createBudget(clock, 1000);
    clock.advance(400);
    expect(budget.remainingMs()).toBe(600);
    expect(budget.isExpired()).toBe(false);
    clock.advance(600);
    await budget.expired;
    expect(budget.isExpired()).toBe(true);
    expect(budget.remainingMs()).toBe(0);
  });
  test('stops while paused, and the pauses nest', () => {
    const clock = fixedClock();
    const budget = createBudget(clock, 1000);
    clock.advance(100);
    budget.pause();
    budget.pause();
    clock.advance(5000);
    budget.resume();
    clock.advance(5000);
    expect(budget.remainingMs()).toBe(900);
    expect(budget.isRunning()).toBe(false);
    budget.resume();
    expect(budget.isRunning()).toBe(true);
    clock.advance(899);
    expect(budget.isExpired()).toBe(false);
    clock.advance(1);
    expect(budget.isExpired()).toBe(true);
  });
  test('holds no timer while paused or disposed', () => {
    const clock = fixedClock();
    const budget = createBudget(clock, 1000);
    expect(clock.pending()).toBe(1);
    budget.pause();
    expect(clock.pending()).toBe(0);
    budget.resume();
    budget.dispose();
    expect(clock.pending()).toBe(0);
    budget.resume();
    clock.advance(5000);
    expect(budget.isExpired()).toBe(false);
  });
  test('a budget created paused runs from its first resume', () => {
    const clock = fixedClock();
    const budget = createBudget(clock, 1000, { paused: true });
    clock.advance(500);
    expect(budget.remainingMs()).toBe(1000);
    budget.resume();
    clock.advance(500);
    expect(budget.remainingMs()).toBe(500);
  });
  test('a child runs the parent: the parent counts only the time its children have the floor', () => {
    const clock = fixedClock();
    const parent = createBudget(clock, 1000, { paused: true });
    const child = createBudget(clock, 10_000, { parent });
    clock.advance(300);
    child.pause();
    clock.advance(5000);
    const other = createBudget(clock, 10_000, { parent });
    clock.advance(200);
    expect(parent.remainingMs()).toBe(500);
    other.dispose();
    clock.advance(5000);
    expect(parent.remainingMs()).toBe(500);
    child.resume();
    clock.advance(500);
    expect(parent.isExpired()).toBe(true);
  });
});
