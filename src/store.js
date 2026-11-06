/** A small Redux-style store: reducers, subscriptions, middleware and enhancers. */

export const INIT = '@@store/INIT';

export function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function createStore(reducer, preloadedState, enhancer) {
  if (typeof preloadedState === 'function' && enhancer === undefined) {
    enhancer = preloadedState;
    preloadedState = undefined;
  }
  if (enhancer !== undefined) {
    if (typeof enhancer !== 'function') throw new TypeError('enhancer must be a function');
    return enhancer(createStore)(reducer, preloadedState);
  }
  if (typeof reducer !== 'function') throw new TypeError('reducer must be a function');

  let currentReducer = reducer;
  let state = preloadedState;
  let listeners = [];
  let dispatching = false;

  function getState() {
    if (dispatching) throw new Error('Cannot call getState while the reducer is executing');
    return state;
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('listener must be a function');
    if (dispatching) throw new Error('Cannot subscribe while the reducer is executing');
    let active = true;
    listeners = [...listeners, listener];
    return function unsubscribe() {
      if (!active) return;
      if (dispatching) throw new Error('Cannot unsubscribe while the reducer is executing');
      active = false;
      listeners = listeners.filter((l) => l !== listener);
    };
  }

  function dispatch(action) {
    if (!isPlainObject(action)) throw new TypeError('Actions must be plain objects. Use middleware for functions or promises.');
    if (typeof action.type !== 'string') throw new TypeError('Actions must have a string "type"');
    if (dispatching) throw new Error('Reducers may not dispatch actions');
    try {
      dispatching = true;
      state = currentReducer(state, action);
    } finally {
      dispatching = false;
    }
    // Listeners added or removed during notification only affect the next dispatch.
    const snapshot = listeners;
    for (const listener of snapshot) listener();
    return action;
  }

  function replaceReducer(next) {
    if (typeof next !== 'function') throw new TypeError('reducer must be a function');
    currentReducer = next;
    dispatch({ type: INIT });
  }

  dispatch({ type: INIT });
  return { getState, subscribe, dispatch, replaceReducer };
}

export function combineReducers(reducers) {
  const keys = Object.keys(reducers);
  for (const key of keys) {
    if (typeof reducers[key] !== 'function') throw new TypeError(`Reducer "${key}" must be a function`);
    if (reducers[key](undefined, { type: INIT }) === undefined) {
      throw new Error(`Reducer "${key}" returned undefined during initialization. Return null instead.`);
    }
  }
  return function combined(state = {}, action) {
    let changed = false;
    const next = {};
    for (const key of keys) {
      const prev = state[key];
      const value = reducers[key](prev, action);
      if (value === undefined) throw new Error(`Reducer "${key}" returned undefined for action "${action.type}"`);
      next[key] = value;
      if (value !== prev) changed = true;
    }
    // Keys that disappeared from the reducer map also count as a change.
    if (!changed && Object.keys(state).length !== keys.length) changed = true;
    return changed ? next : state;
  };
}

export function compose(...fns) {
  if (fns.length === 0) return (arg) => arg;
  if (fns.length === 1) return fns[0];
  return fns.reduce((a, b) => (...args) => a(b(...args)));
}

export function applyMiddleware(...middlewares) {
  return (createStoreFn) => (reducer, preloadedState) => {
    const store = createStoreFn(reducer, preloadedState);
    let dispatch = () => {
      throw new Error('Dispatching while constructing middleware is not allowed');
    };
    const api = {
      getState: store.getState,
      dispatch: (action) => dispatch(action),
    };
    const chain = middlewares.map((mw) => mw(api));
    dispatch = compose(...chain)(store.dispatch);
    return { ...store, dispatch };
  };
}

export function bindActionCreators(creators, dispatch) {
  if (typeof creators === 'function') return (...args) => dispatch(creators(...args));
  const bound = {};
  for (const key of Object.keys(creators)) {
    if (typeof creators[key] === 'function') bound[key] = (...args) => dispatch(creators[key](...args));
  }
  return bound;
}
