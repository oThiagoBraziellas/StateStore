import { isPlainObject } from './store.js';

/**
 * Time-travel enhancer. It wraps the user's reducer in a "lifted" reducer that records every
 * action together with the state it produced, so any point in history can be revisited,
 * skipped (toggled off) or replayed.
 *
 * Lifted state:
 *   { initialState, entries: [{ id, action, skipped, state, error }], currentIndex, nextId, paused }
 * currentIndex === -1 means "initial state". Dispatching while time-travelled discards the future.
 */

const PERFORM = '@@devtools/PERFORM';
const JUMP = '@@devtools/JUMP';
const TOGGLE = '@@devtools/TOGGLE';
const RESET = '@@devtools/RESET';
const COMMIT = '@@devtools/COMMIT';
const PAUSE = '@@devtools/PAUSE';
const IMPORT = '@@devtools/IMPORT';
const RELOAD = '@@devtools/RELOAD';

function run(reducer, prev, action) {
  try {
    return { state: reducer(prev, action), error: null };
  } catch (error) {
    return { state: prev, error: String(error && error.message ? error.message : error) };
  }
}

/** Recomputes entries from `from` onward after a reducer or skip change. */
function recompute(reducer, lifted, from = 0) {
  const entries = lifted.entries.slice(0, from);
  let prev = from === 0 ? lifted.initialState : entries[from - 1].state;
  for (let i = from; i < lifted.entries.length; i++) {
    const e = lifted.entries[i];
    if (e.skipped) {
      entries.push({ ...e, state: prev, error: null });
    } else {
      const { state, error } = run(reducer, prev, e.action);
      entries.push({ ...e, state, error });
      prev = state;
    }
  }
  return { ...lifted, entries };
}

export const currentState = (lifted) => (lifted.currentIndex === -1 ? lifted.initialState : lifted.entries[lifted.currentIndex].state);

function liftReducer(reducer) {
  return function lifted(liftedState, action) {
    if (liftedState === undefined) {
      const initialState = reducer(undefined, { type: '@@devtools/INIT' });
      return { initialState, entries: [], currentIndex: -1, nextId: 1, paused: false };
    }
    switch (action.type) {
      case PERFORM: {
        const inner = action.action;
        if (liftedState.paused) {
          // Paused: the app keeps working, but nothing is recorded. The new state replaces the
          // one at the cursor (so it is ephemeral and discarded by a later recompute).
          const { state } = run(reducer, currentState(liftedState), inner);
          if (liftedState.currentIndex === -1) return { ...liftedState, initialState: state };
          return {
            ...liftedState,
            entries: liftedState.entries.map((e, i) => (i === liftedState.currentIndex ? { ...e, state } : e)),
          };
        }
        const kept = liftedState.entries.slice(0, liftedState.currentIndex + 1);
        const prev = currentState(liftedState);
        const { state, error } = run(reducer, prev, inner);
        const entries = [...kept, { id: liftedState.nextId, action: inner, skipped: false, state, error }];
        return { ...liftedState, entries, currentIndex: entries.length - 1, nextId: liftedState.nextId + 1 };
      }
      case JUMP: {
        const index = Math.min(Math.max(action.index, -1), liftedState.entries.length - 1);
        return index === liftedState.currentIndex ? liftedState : { ...liftedState, currentIndex: index };
      }
      case TOGGLE: {
        const at = liftedState.entries.findIndex((e) => e.id === action.id);
        if (at === -1) return liftedState;
        const entries = liftedState.entries.map((e, i) => (i === at ? { ...e, skipped: !e.skipped } : e));
        return recompute(reducer, { ...liftedState, entries }, at);
      }
      case RESET:
        return { ...liftedState, entries: [], currentIndex: -1 };
      case COMMIT: {
        const state = currentState(liftedState);
        return { initialState: state, entries: [], currentIndex: -1, nextId: liftedState.nextId, paused: liftedState.paused };
      }
      case PAUSE:
        return { ...liftedState, paused: !liftedState.paused };
      case IMPORT: {
        const entries = action.session.actions.map((a, i) => ({ id: liftedState.nextId + i, action: a, skipped: false, state: null, error: null }));
        const base = { ...liftedState, initialState: action.session.initialState, entries, currentIndex: entries.length - 1, nextId: liftedState.nextId + entries.length };
        return recompute(reducer, base, 0);
      }
      case RELOAD:
        // The reducer was replaced: replay history with the new logic.
        return { ...recompute(reducer, { ...liftedState, initialState: reducer(undefined, { type: '@@devtools/INIT' }) }, 0) };
      default:
        return liftedState;
    }
  };
}

export function createDevTools() {
  let liftedStore = null;
  let currentReducer = null;

  function enhancer(createStore) {
    return (reducer, preloadedState) => {
      currentReducer = reducer;
      const preloaded = preloadedState === undefined ? undefined : {
        initialState: preloadedState, entries: [], currentIndex: -1, nextId: 1, paused: false,
      };
      liftedStore = createStore(liftReducer(reducer), preloaded);
      return {
        getState: () => currentState(liftedStore.getState()),
        dispatch(action) {
          if (!isPlainObject(action) || typeof action.type !== 'string') {
            throw new TypeError('Actions must be plain objects with a string "type"');
          }
          liftedStore.dispatch({ type: PERFORM, action });
          return action;
        },
        subscribe: liftedStore.subscribe,
        replaceReducer(next) {
          currentReducer = next;
          liftedStore.replaceReducer(liftReducer(next));
          liftedStore.dispatch({ type: RELOAD });
        },
      };
    };
  }

  const dispatchLifted = (action) => liftedStore.dispatch(action);

  return {
    enhancer,
    getLifted: () => liftedStore.getState(),
    subscribe: (fn) => liftedStore.subscribe(fn),
    jumpTo: (index) => dispatchLifted({ type: JUMP, index }),
    stepBack() { const l = liftedStore.getState(); dispatchLifted({ type: JUMP, index: l.currentIndex - 1 }); },
    stepForward() { const l = liftedStore.getState(); dispatchLifted({ type: JUMP, index: l.currentIndex + 1 }); },
    toggleAction: (id) => dispatchLifted({ type: TOGGLE, id }),
    reset: () => dispatchLifted({ type: RESET }),
    commit: () => dispatchLifted({ type: COMMIT }),
    togglePause: () => dispatchLifted({ type: PAUSE }),
    exportSession() {
      const l = liftedStore.getState();
      return JSON.stringify({ version: 1, initialState: l.initialState, actions: l.entries.filter((e) => !e.skipped).map((e) => e.action) });
    },
    importSession(json) {
      const session = typeof json === 'string' ? JSON.parse(json) : json;
      if (!session || !Array.isArray(session.actions) || !session.actions.every((a) => isPlainObject(a) && typeof a.type === 'string')) {
        throw new Error('Invalid session');
      }
      dispatchLifted({ type: IMPORT, session });
    },
    get reducer() { return currentReducer; },
  };
}
