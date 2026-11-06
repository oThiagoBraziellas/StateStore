import { createStore, combineReducers, applyMiddleware, compose } from './store.js';
import { thunk } from './middleware.js';
import { createSelector } from './selectors.js';
import { createDevTools } from './devtools.js';

// ---- reducers ----------------------------------------------------------------------------

export function counter(state = 0, action) {
  switch (action.type) {
    case 'counter/increment': return state + 1;
    case 'counter/decrement': return state - 1;
    case 'counter/add': return state + action.amount;
    case 'counter/reset': return 0;
    default: return state;
  }
}

export function todos(state = [], action) {
  switch (action.type) {
    case 'todos/add': {
      const title = String(action.title ?? '').trim();
      return title ? [...state, { id: action.id, title, done: false }] : state;
    }
    case 'todos/toggle':
      return state.map((t) => (t.id === action.id ? { ...t, done: !t.done } : t));
    case 'todos/remove':
      return state.filter((t) => t.id !== action.id);
    case 'todos/clearDone':
      return state.some((t) => t.done) ? state.filter((t) => !t.done) : state;
    default:
      return state;
  }
}

export function filter(state = 'all', action) {
  return action.type === 'filter/set' ? action.value : state;
}

export function quote(state = { status: 'idle', text: null, error: null }, action) {
  switch (action.type) {
    case 'quote/pending': return { status: 'loading', text: state.text, error: null };
    case 'quote/fulfilled': return { status: 'ready', text: action.text, error: null };
    case 'quote/rejected': return { status: 'failed', text: state.text, error: action.error };
    default: return state;
  }
}

export const rootReducer = combineReducers({ counter, todos, filter, quote });

// ---- action creators ---------------------------------------------------------------------

let nextTodoId = 1;
export const actions = {
  increment: () => ({ type: 'counter/increment' }),
  decrement: () => ({ type: 'counter/decrement' }),
  add: (amount) => ({ type: 'counter/add', amount }),
  reset: () => ({ type: 'counter/reset' }),
  addTodo: (title) => ({ type: 'todos/add', id: nextTodoId++, title }),
  toggleTodo: (id) => ({ type: 'todos/toggle', id }),
  removeTodo: (id) => ({ type: 'todos/remove', id }),
  clearDone: () => ({ type: 'todos/clearDone' }),
  setFilter: (value) => ({ type: 'filter/set', value }),
};

const QUOTES = [
  'Make it work, make it right, make it fast.',
  'Simple is better than complex.',
  'Premature optimization is the root of all evil.',
  'Programs must be written for people to read.',
];

/** Async thunk: simulates a network call. `fetchQuote` is injectable for tests. */
export function loadQuote(fetchQuote = defaultFetchQuote) {
  return async (dispatch) => {
    dispatch({ type: 'quote/pending' });
    try {
      dispatch({ type: 'quote/fulfilled', text: await fetchQuote() });
    } catch (error) {
      dispatch({ type: 'quote/rejected', error: error.message });
    }
  };
}

function defaultFetchQuote() {
  return new Promise((resolve, reject) => {
    setTimeout(() => (Math.random() < 0.2 ? reject(new Error('Network down (simulated)')) : resolve(QUOTES[Math.floor(Math.random() * QUOTES.length)])), 600);
  });
}

// ---- selectors ---------------------------------------------------------------------------

export const selectTodos = (s) => s.todos;
export const selectFilter = (s) => s.filter;

export const selectVisibleTodos = createSelector(selectTodos, selectFilter, (list, f) => {
  if (f === 'active') return list.filter((t) => !t.done);
  if (f === 'done') return list.filter((t) => t.done);
  return list;
});

export const selectStats = createSelector(selectTodos, (list) => {
  const done = list.filter((t) => t.done).length;
  return { total: list.length, done, active: list.length - done };
});

// ---- wiring ------------------------------------------------------------------------------

export function createAppStore() {
  const devtools = createDevTools();
  const store = createStore(rootReducer, compose(applyMiddleware(thunk), devtools.enhancer));
  return { store, devtools };
}
