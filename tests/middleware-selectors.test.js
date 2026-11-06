import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, applyMiddleware } from '../src/store.js';
import { thunk, createThunk, createLogger, createCrashReporter, createThrottle } from '../src/middleware.js';
import { createSelector } from '../src/selectors.js';
import { diffState } from '../src/diff.js';

const counter = (state = 0, action) => (action.type === 'inc' ? state + 1 : action.type === 'boom' ? (() => { throw new Error('kaboom'); })() : state);

test('thunk runs functions with dispatch, getState and the extra argument', async () => {
  const store = createStore(counter, applyMiddleware(createThunk({ api: 'x' })));
  const result = await store.dispatch(async (dispatch, getState, extra) => {
    dispatch({ type: 'inc' });
    await null;
    dispatch({ type: 'inc' });
    return `${getState()}-${extra.api}`;
  });
  assert.equal(result, '2-x');
});

test('thunk passes plain actions through', () => {
  const store = createStore(counter, applyMiddleware(thunk));
  store.dispatch({ type: 'inc' });
  assert.equal(store.getState(), 1);
});

test('logger reports before and after states', () => {
  const entries = [];
  const store = createStore(counter, applyMiddleware(createLogger((e) => entries.push(e))));
  store.dispatch({ type: 'inc' });
  assert.deepEqual(entries.map((e) => [e.type, e.before, e.after]), [['inc', 0, 1]]);
});

test('crash reporter reports errors and rethrows', () => {
  const reports = [];
  const store = createStore(counter, applyMiddleware(createCrashReporter((err, ctx) => reports.push([err.message, ctx.action.type, ctx.state]))));
  assert.throws(() => store.dispatch({ type: 'boom' }), /kaboom/);
  assert.deepEqual(reports, [['kaboom', 'boom', 0]]);
  store.dispatch({ type: 'inc' });
  assert.equal(store.getState(), 1);
});

test('throttle drops repeated actions inside the window', () => {
  let t = 1000;
  const store = createStore(counter, applyMiddleware(createThrottle(['inc'], 100, () => t)));
  store.dispatch({ type: 'inc' });
  t = 1050;
  store.dispatch({ type: 'inc' });
  t = 1200;
  store.dispatch({ type: 'inc' });
  assert.equal(store.getState(), 2);
});

test('createSelector memoises on input identity', () => {
  const state = { items: [1, 2, 3], filter: 'all', other: 0 };
  const sel = createSelector((s) => s.items, (s) => s.filter, (items, filter) => items.filter((n) => filter === 'all' || n > 1));
  const first = sel(state);
  assert.equal(sel({ ...state, other: 1 }), first);
  assert.equal(sel.recomputations(), 1);
  const second = sel({ ...state, filter: 'big' });
  assert.deepEqual(second, [2, 3]);
  assert.equal(sel.recomputations(), 2);
  sel({ ...state, items: [...state.items], filter: 'big' });
  assert.equal(sel.recomputations(), 3);
});

test('createSelector accepts an array of inputs, composes, and validates arguments', () => {
  const total = createSelector([(s) => s.a, (s) => s.b], (a, b) => a + b);
  const doubled = createSelector(total, (t) => t * 2);
  assert.equal(doubled({ a: 1, b: 2 }), 6);
  assert.throws(() => createSelector(1, 2), TypeError);
  assert.throws(() => createSelector((s) => s), TypeError);
});

test('diffState lists changed paths', () => {
  assert.deepEqual(diffState({ a: 1 }, { a: 1 }), []);
  assert.deepEqual(diffState({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 3 } }), [{ path: 'b.c', before: 2, after: 3 }]);
  assert.deepEqual(diffState({ list: [1, 2] }, { list: [1, 2, 3] }), [{ path: 'list[2]', before: undefined, after: 3 }]);
  assert.deepEqual(diffState({ a: 1 }, { b: 1 }), [
    { path: 'a', before: 1, after: undefined },
    { path: 'b', before: undefined, after: 1 },
  ]);
  assert.deepEqual(diffState(1, 2), [{ path: '(root)', before: 1, after: 2 }]);
  assert.deepEqual(diffState([], {}).length, 1);
});
