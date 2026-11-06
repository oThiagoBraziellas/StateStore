import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  counter, todos, filter, quote, rootReducer, actions, loadQuote, selectVisibleTodos, selectStats, createAppStore,
} from '../src/demo-store.js';

test('counter reducer', () => {
  assert.equal(counter(undefined, { type: '?' }), 0);
  assert.equal(counter(5, actions.increment()), 6);
  assert.equal(counter(5, actions.decrement()), 4);
  assert.equal(counter(5, actions.add(10)), 15);
  assert.equal(counter(5, actions.reset()), 0);
});

test('todos reducer adds, toggles, removes and clears', () => {
  let s = todos(undefined, { type: '?' });
  s = todos(s, { type: 'todos/add', id: 1, title: ' a ' });
  s = todos(s, { type: 'todos/add', id: 2, title: 'b' });
  assert.equal(todos(s, { type: 'todos/add', id: 3, title: '  ' }), s);
  s = todos(s, actions.toggleTodo(1));
  assert.deepEqual(s.map((t) => t.done), [true, false]);
  assert.equal(todos(s, actions.clearDone()).length, 1);
  assert.equal(todos(todos(s, actions.clearDone()), actions.clearDone()).length, 1);
  assert.deepEqual(todos(s, actions.removeTodo(2)).map((t) => t.id), [1]);
});

test('filter and quote reducers', () => {
  assert.equal(filter(undefined, actions.setFilter('done')), 'done');
  assert.equal(filter('done', { type: '?' }), 'done');
  assert.equal(quote(undefined, { type: 'quote/pending' }).status, 'loading');
  assert.deepEqual(quote(undefined, { type: 'quote/fulfilled', text: 'hi' }), { status: 'ready', text: 'hi', error: null });
  assert.equal(quote({ status: 'loading', text: 'old', error: null }, { type: 'quote/rejected', error: 'x' }).text, 'old');
});

test('the root reducer keeps unchanged slices by reference', () => {
  const s1 = rootReducer(undefined, { type: '?' });
  const s2 = rootReducer(s1, actions.increment());
  assert.equal(s2.todos, s1.todos);
  assert.notEqual(s2.counter, s1.counter);
});

test('selectors filter, count and memoise', () => {
  const state = rootReducer(undefined, { type: '?' });
  const s = [
    { type: 'todos/add', id: 1, title: 'a' }, { type: 'todos/add', id: 2, title: 'b' }, actions.toggleTodo(1),
  ].reduce(rootReducer, state);
  assert.deepEqual(selectStats(s), { total: 2, done: 1, active: 1 });
  assert.deepEqual(selectVisibleTodos({ ...s, filter: 'done' }).map((t) => t.id), [1]);
  assert.deepEqual(selectVisibleTodos({ ...s, filter: 'active' }).map((t) => t.id), [2]);
  const before = selectVisibleTodos.recomputations();
  selectVisibleTodos({ ...s, filter: 'active' });
  selectVisibleTodos({ ...s, filter: 'active', counter: 99 });
  assert.equal(selectVisibleTodos.recomputations(), before);
});

test('loadQuote dispatches pending then fulfilled or rejected', async () => {
  const { store, devtools } = createAppStore();
  await store.dispatch(loadQuote(async () => 'hello'));
  assert.deepEqual(store.getState().quote, { status: 'ready', text: 'hello', error: null });
  await store.dispatch(loadQuote(async () => { throw new Error('nope'); }));
  assert.equal(store.getState().quote.status, 'failed');
  assert.deepEqual(devtools.getLifted().entries.map((e) => e.action.type), [
    'quote/pending', 'quote/fulfilled', 'quote/pending', 'quote/rejected',
  ]);
});

test('time travel works on the demo store', () => {
  const { store, devtools } = createAppStore();
  store.dispatch(actions.increment());
  store.dispatch(actions.addTodo('x'));
  store.dispatch(actions.add(5));
  assert.equal(store.getState().counter, 6);
  devtools.jumpTo(1);
  assert.equal(store.getState().counter, 1);
  assert.equal(store.getState().todos.length, 1);
  devtools.jumpTo(0);
  assert.equal(store.getState().todos.length, 0);
});
