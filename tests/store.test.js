import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, combineReducers, compose, applyMiddleware, bindActionCreators } from '../src/store.js';

const counter = (state = 0, action) => {
  switch (action.type) {
    case 'inc': return state + 1;
    case 'add': return state + action.by;
    default: return state;
  }
};

test('createStore initialises state through the reducer', () => {
  assert.equal(createStore(counter).getState(), 0);
  assert.equal(createStore(counter, 10).getState(), 10);
});

test('dispatch runs the reducer and returns the action', () => {
  const store = createStore(counter);
  const action = { type: 'add', by: 5 };
  assert.equal(store.dispatch(action), action);
  assert.equal(store.getState(), 5);
});

test('dispatch rejects non-plain or untyped actions', () => {
  const store = createStore(counter);
  assert.throws(() => store.dispatch(() => {}), TypeError);
  assert.throws(() => store.dispatch(null), TypeError);
  assert.throws(() => store.dispatch({}), TypeError);
  assert.throws(() => store.dispatch({ type: 5 }), TypeError);
  assert.throws(() => store.dispatch(new (class A { type = 'x'; })()), TypeError);
});

test('subscribe notifies after each dispatch and unsubscribe stops it', () => {
  const store = createStore(counter);
  let calls = 0;
  const off = store.subscribe(() => { calls += 1; });
  store.dispatch({ type: 'inc' });
  store.dispatch({ type: 'inc' });
  off();
  off();
  store.dispatch({ type: 'inc' });
  assert.equal(calls, 2);
});

test('listeners subscribed during a notification run only on the next dispatch', () => {
  const store = createStore(counter);
  const order = [];
  store.subscribe(() => {
    order.push('a');
    store.subscribe(() => order.push('late'));
  });
  store.dispatch({ type: 'inc' });
  assert.deepEqual(order, ['a']);
  store.dispatch({ type: 'inc' });
  assert.deepEqual(order, ['a', 'a', 'late']);
});

test('a listener can unsubscribe another without breaking the current round', () => {
  const store = createStore(counter);
  const seen = [];
  let offB;
  store.subscribe(() => { seen.push('a'); offB(); });
  offB = store.subscribe(() => seen.push('b'));
  store.dispatch({ type: 'inc' });
  assert.deepEqual(seen, ['a', 'b']);
  store.dispatch({ type: 'inc' });
  assert.deepEqual(seen, ['a', 'b', 'a']);
});

test('reducers may not dispatch or read the store', () => {
  let store;
  const bad = (state = 0, action) => {
    if (action.type === 'go') store.dispatch({ type: 'inc' });
    return state;
  };
  store = createStore(bad);
  assert.throws(() => store.dispatch({ type: 'go' }), /may not dispatch/);
  const sneaky = (state = 0, action) => { if (action.type === 'peek') store2.getState(); return state; };
  const store2 = createStore(sneaky);
  assert.throws(() => store2.dispatch({ type: 'peek' }), /getState/);
  // the store stays usable after a reducer error
  assert.doesNotThrow(() => store2.dispatch({ type: 'other' }));
});

test('replaceReducer swaps logic and keeps state', () => {
  const store = createStore(counter, 3);
  store.replaceReducer((state = 0, a) => (a.type === 'inc' ? state + 100 : state));
  store.dispatch({ type: 'inc' });
  assert.equal(store.getState(), 103);
});

test('combineReducers builds a state tree and preserves identity when nothing changes', () => {
  const root = combineReducers({ count: counter, name: (s = 'x', a) => (a.type === 'rename' ? a.name : s) });
  const store = createStore(root);
  assert.deepEqual(store.getState(), { count: 0, name: 'x' });
  const before = store.getState();
  store.dispatch({ type: 'unknown' });
  assert.equal(store.getState(), before);
  store.dispatch({ type: 'rename', name: 'y' });
  assert.deepEqual(store.getState(), { count: 0, name: 'y' });
  assert.equal(store.getState().count, before.count);
});

test('combineReducers rejects reducers that return undefined', () => {
  assert.throws(() => combineReducers({ bad: () => undefined }), /undefined/);
  assert.throws(() => combineReducers({ bad: 5 }), TypeError);
  const flaky = combineReducers({ x: (s = 1, a) => (a.type === 'boom' ? undefined : s) });
  assert.throws(() => flaky(undefined, { type: 'boom' }), /boom/);
});

test('compose applies right to left', () => {
  const log = [];
  const f = (n) => { log.push('f'); return n + 1; };
  const g = (n) => { log.push('g'); return n * 2; };
  assert.equal(compose(f, g)(5), 11);
  assert.deepEqual(log, ['g', 'f']);
  assert.equal(compose()(7), 7);
  assert.equal(compose(f)(1), 2);
});

test('applyMiddleware wraps dispatch in order and gives middleware the store API', () => {
  const trace = [];
  const mw = (name) => ({ getState }) => (next) => (action) => {
    trace.push(`${name}:before:${getState()}`);
    const result = next(action);
    trace.push(`${name}:after:${getState()}`);
    return result;
  };
  const store = createStore(counter, applyMiddleware(mw('A'), mw('B')));
  store.dispatch({ type: 'inc' });
  assert.deepEqual(trace, ['A:before:0', 'B:before:0', 'B:after:1', 'A:after:1']);
});

test('middleware can short-circuit, replace and re-dispatch actions', () => {
  const blocker = () => (next) => (action) => (action.type === 'blocked' ? undefined : next(action));
  const doubler = ({ dispatch }) => (next) => (action) => {
    if (action.type === 'twice') { next({ type: 'inc' }); return dispatch({ type: 'inc' }); }
    return next(action);
  };
  const store = createStore(counter, applyMiddleware(blocker, doubler));
  store.dispatch({ type: 'blocked' });
  assert.equal(store.getState(), 0);
  store.dispatch({ type: 'twice' });
  assert.equal(store.getState(), 2);
});

test('dispatching during middleware construction throws', () => {
  const eager = ({ dispatch }) => { dispatch({ type: 'inc' }); return (next) => next; };
  assert.throws(() => createStore(counter, applyMiddleware(eager)), /constructing middleware/);
});

test('bindActionCreators binds a function or an object of creators', () => {
  const store = createStore(counter);
  const inc = bindActionCreators(() => ({ type: 'inc' }), store.dispatch);
  inc();
  const bound = bindActionCreators({ add: (by) => ({ type: 'add', by }), notAFunction: 1 }, store.dispatch);
  bound.add(10);
  assert.equal(store.getState(), 11);
  assert.equal('notAFunction' in bound, false);
});
