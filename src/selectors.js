/**
 * Memoised selector factory (reselect-style). The result function re-runs only when an
 * input selector returns a different reference/value than last time.
 */
export function createSelector(...funcs) {
  const resultFn = funcs.pop();
  const inputs = Array.isArray(funcs[0]) ? funcs[0] : funcs;
  if (typeof resultFn !== 'function' || inputs.length === 0 || inputs.some((f) => typeof f !== 'function')) {
    throw new TypeError('createSelector expects input selectors followed by a result function');
  }
  let lastArgs = null;
  let lastResult;
  let recomputations = 0;

  function selector(state, ...rest) {
    const args = inputs.map((fn) => fn(state, ...rest));
    if (lastArgs && args.length === lastArgs.length && args.every((a, i) => Object.is(a, lastArgs[i]))) {
      return lastResult;
    }
    lastArgs = args;
    lastResult = resultFn(...args);
    recomputations += 1;
    return lastResult;
  }
  selector.recomputations = () => recomputations;
  selector.resetRecomputations = () => { recomputations = 0; };
  return selector;
}
