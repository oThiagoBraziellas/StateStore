import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, applyMiddleware, compose } from '../src/store.js';
import { thunk } from '../src/middleware.js';
import { createDevTools } from '../src/devtools.js';

const counter = (state = 0, action) => {
  switch (action.type) {
    case 'inc': return state + 1;
    case 'add': return state + action.by;
    case 'mul': return state * action.by;
    case 'fail': throw new Error('reducer failed');
    default: return state;
  }
};

function setup(reducer = counter, preloaded) {
  const dev = createDevTools();
  const store = createStore(reducer, preloaded, dev.enhancer);
  return { dev, store };
}

test('the store behaves normally through the enhancer', () => {
  const { store } = setup();
  let notified = 0;
  store.subscribe(() => { notified += 1; });
  store.dispatch({ type: 'add', by: 4 });
  store.dispatch({ type: 'inc' });
  assert.equal(store.getState(), 5);
  assert.equal(notified, 2);
  assert.throws(() => store.dispatch(() => {}), TypeError);
});

test('every action is recorded with the state it produced', () => {
  const { dev, store } = setup();
  store.dispatch({ type: 'add', by: 2 });
  store.dispatch({ type: 'mul', by: 5 });
  const l = dev.getLifted();
  assert.equal(l.entries.length, 2);
  assert.deepEqual(l.entries.map((e) => e.state), [2, 10]);
  assert.equal(l.currentIndex, 1);
});

test('jumpTo travels to any point, including the initial state', () => {
  const { dev, store } = setup();
  store.dispatch({ type: 'add', by: 2 });
  store.dispatch({ type: 'mul', by: 5 });
  store.dispatch({ type: 'inc' });
  dev.jumpTo(0);
  assert.equal(store.getState(), 2);
  dev.jumpTo(-1);
  assert.equal(store.getState(), 0);
  dev.jumpTo(99);
  assert.equal(store.getState(), 11);
  dev.jumpTo(-50);
  assert.equal(store.getState(), 0);
});

test('stepBack and stepForward move one action at a time and stop at the ends', () => {
  const { dev, store } = setup();
  store.dispatch({ type: 'inc' });
  store.dispatch({ type: 'inc' });
  dev.stepBack();
  assert.equal(store.getState(), 1);
  dev.stepBack();
  dev.stepBack();
  assert.equal(store.getState(), 0);
  dev.stepForward();
  dev.stepForward();
  dev.stepForward();
  assert.equal(store.getState(), 2);
});

test('subscribers are notified when time travelling', () => {
  const { dev, store } = setup();
  store.dispatch({ type: 'inc' });
  let calls = 0;
  store.subscribe(() => { calls += 1; });
  dev.jumpTo(-1);
  assert.equal(calls, 1);
});

test('dispatching after travelling back discards the future', () => {
  const { dev, store } = setup();
  store.dispatch({ type: 'add', by: 1 });
  store.dispatch({ type: 'add', by: 2 });
  store.dispatch({ type: 'add', by: 3 });
  dev.jumpTo(0);
  store.dispatch({ type: 'add', by: 100 });
  const l = dev.getLifted();
  assert.deepEqual(l.entries.map((e) => e.state), [1, 101]);
  assert.equal(store.getState(), 101);
});

test('toggling an action off recomputes everything after it', () => {
  const { dev, store } = setup();
  store.dispatch({ type: 'add', by: 2 });
  store.dispatch({ type: 'mul', by: 10 });
  store.dispatch({ type: 'add', by: 1 });
  assert.equal(store.getState(), 21);
  const idOfMul = dev.getLifted().entries[1].id;
  dev.toggleAction(idOfMul);
  assert.equal(store.getState(), 3);
  assert.deepEqual(dev.getLifted().entries.map((e) => e.skipped), [false, true, false]);
  dev.toggleAction(idOfMul);
  assert.equal(store.getState(), 21);
  dev.toggleAction(9999);
  assert.equal(store.getState(), 21);
});

test('reducer errors are captured per action and do not break history', () => {
  const { dev, store } = setup();
  store.dispatch({ type: 'inc' });
  store.dispatch({ type: 'fail' });
  store.dispatch({ type: 'inc' });
  const l = dev.getLifted();
  assert.equal(l.entries[1].error, 'reducer failed');
  assert.equal(store.getState(), 2);
});

test('reset clears history but keeps the initial state; commit makes the current state the new baseline', () => {
  const { dev, store } = setup(counter, 5);
  store.dispatch({ type: 'inc' });
  store.dispatch({ type: 'inc' });
  dev.commit();
  assert.equal(dev.getLifted().entries.length, 0);
  assert.equal(store.getState(), 7);
  store.dispatch({ type: 'inc' });
  dev.reset();
  assert.equal(store.getState(), 7);
  assert.equal(dev.getLifted().entries.length, 0);
});

test('pause stops recording while the app keeps working', () => {
  const { dev, store } = setup();
  store.dispatch({ type: 'inc' });
  dev.togglePause();
  store.dispatch({ type: 'inc' });
  assert.equal(dev.getLifted().entries.length, 1);
  assert.equal(store.getState(), 2);
  dev.togglePause();
  store.dispatch({ type: 'inc' });
  assert.equal(dev.getLifted().entries.length, 2);
  assert.equal(store.getState(), 3);
});

test('exportSession and importSession replay the recorded actions', () => {
  const a = setup();
  a.store.dispatch({ type: 'add', by: 3 });
  a.store.dispatch({ type: 'mul', by: 4 });
  a.dev.toggleAction(a.dev.getLifted().entries[0].id);
  const json = a.dev.exportSession();
  assert.deepEqual(JSON.parse(json).actions, [{ type: 'mul', by: 4 }]);

  const b = setup();
  b.dev.importSession(json);
  assert.equal(b.store.getState(), 0);
  assert.equal(b.dev.getLifted().entries.length, 1);
  b.dev.importSession({ initialState: 2, actions: [{ type: 'add', by: 1 }, { type: 'mul', by: 3 }] });
  assert.equal(b.store.getState(), 9);
  assert.throws(() => b.dev.importSession('{"actions":[1]}'), /Invalid session/);
});

test('replaceReducer replays history with the new logic (hot reload)', () => {
  const { dev, store } = setup();
  store.dispatch({ type: 'inc' });
  store.dispatch({ type: 'inc' });
  store.replaceReducer((state = 0, a) => (a.type === 'inc' ? state + 10 : state));
  assert.equal(store.getState(), 20);
  assert.equal(dev.getLifted().entries.length, 2);
});

test('works together with middleware: thunks dispatch through the recorder', async () => {
  const dev = createDevTools();
  const store = createStore(counter, compose(applyMiddleware(thunk), dev.enhancer));
  await store.dispatch(async (dispatch) => {
    dispatch({ type: 'inc' });
    await null;
    dispatch({ type: 'add', by: 5 });
  });
  assert.equal(store.getState(), 6);
  assert.deepEqual(dev.getLifted().entries.map((e) => e.action.type), ['inc', 'add']);
});
