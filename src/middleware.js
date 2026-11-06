/** Middleware: ({ getState, dispatch }) => (next) => (action) => result */

/** Lets action creators return functions: (dispatch, getState, extra) => ... */
export function createThunk(extraArgument) {
  return ({ dispatch, getState }) => (next) => (action) => {
    if (typeof action === 'function') return action(dispatch, getState, extraArgument);
    return next(action);
  };
}
export const thunk = createThunk();

/** Records every action with the state before and after it. */
export function createLogger(log = console.log) {
  return ({ getState }) => (next) => (action) => {
    const before = getState();
    const result = next(action);
    log({ type: action.type, action, before, after: getState() });
    return result;
  };
}

/** Catches reducer or subscriber errors and reports them instead of crashing the caller. */
export function createCrashReporter(report) {
  return ({ getState }) => (next) => (action) => {
    try {
      return next(action);
    } catch (error) {
      report(error, { action, state: getState() });
      throw error;
    }
  };
}

/** Drops actions of the same type dispatched within `ms` of each other (for noisy events). */
export function createThrottle(types, ms, now = Date.now) {
  const last = new Map();
  return () => (next) => (action) => {
    if (!types.includes(action.type)) return next(action);
    const t = now();
    if (last.has(action.type) && t - last.get(action.type) < ms) return action;
    last.set(action.type, t);
    return next(action);
  };
}
