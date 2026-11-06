import { createAppStore, actions, loadQuote, selectVisibleTodos, selectStats } from './demo-store.js';
import { bindActionCreators } from './store.js';
import { currentState } from './devtools.js';
import { diffState } from './diff.js';

const { store, devtools } = createAppStore();
const act = bindActionCreators(actions, store.dispatch);
const $ = (s) => document.querySelector(s);

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

// ---- app panel ---------------------------------------------------------------------------

const ui = {
  count: $('#count'), todoForm: $('#todo-form'), todoInput: $('#todo-input'), todoList: $('#todo-list'),
  filters: document.querySelectorAll('[data-filter]'), stats: $('#todo-stats'), quote: $('#quote'),
  quoteBtn: $('#quote-btn'), recomputes: $('#recomputes'),
};

function renderApp() {
  const s = store.getState();
  ui.count.textContent = String(s.counter);
  const visible = selectVisibleTodos(s);
  ui.todoList.replaceChildren(...visible.map((t) => {
    const li = el('li', t.done ? 'done' : '');
    const cb = el('input');
    cb.type = 'checkbox';
    cb.checked = t.done;
    cb.setAttribute('aria-label', `Toggle ${t.title}`);
    cb.addEventListener('change', () => act.toggleTodo(t.id));
    const x = el('button', 'x', '×');
    x.type = 'button';
    x.setAttribute('aria-label', `Remove ${t.title}`);
    x.addEventListener('click', () => act.removeTodo(t.id));
    li.append(cb, el('span', '', t.title), x);
    return li;
  }));
  const st = selectStats(s);
  ui.stats.textContent = `${st.active} active, ${st.done} done`;
  ui.filters.forEach((b) => b.classList.toggle('on', b.dataset.filter === s.filter));
  const q = s.quote;
  ui.quote.textContent = q.status === 'loading' ? 'Loading…' : q.status === 'failed' ? `Error: ${q.error}` : q.text ?? 'No quote yet.';
  ui.quoteBtn.disabled = q.status === 'loading';
  ui.recomputes.textContent = `selectVisibleTodos recomputations: ${selectVisibleTodos.recomputations()}`;
}

$('#inc').addEventListener('click', act.increment);
$('#dec').addEventListener('click', act.decrement);
$('#add5').addEventListener('click', () => act.add(5));
$('#reset').addEventListener('click', act.reset);
ui.todoForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (ui.todoInput.value.trim()) { act.addTodo(ui.todoInput.value); ui.todoInput.value = ''; }
});
ui.filters.forEach((b) => b.addEventListener('click', () => act.setFilter(b.dataset.filter)));
$('#clear-done').addEventListener('click', act.clearDone);
ui.quoteBtn.addEventListener('click', () => store.dispatch(loadQuote()));

// ---- debugger panel ----------------------------------------------------------------------

const dbg = {
  log: $('#log'), slider: $('#slider'), pos: $('#pos'), state: $('#state-view'), diff: $('#diff-view'),
  play: $('#play'), pause: $('#pause'),
};
let playTimer = null;

function stopPlay() {
  clearInterval(playTimer);
  playTimer = null;
  dbg.play.textContent = 'Replay';
}

function renderDebugger() {
  const l = devtools.getLifted();
  const last = l.entries.length - 1;
  dbg.slider.max = String(Math.max(last + 1, 0));
  dbg.slider.value = String(l.currentIndex + 1);
  dbg.pos.textContent = `${l.currentIndex + 1} / ${l.entries.length}`;
  dbg.pause.textContent = l.paused ? 'Resume recording' : 'Pause recording';

  const initial = el('li', 'entry' + (l.currentIndex === -1 ? ' current' : ''));
  const initBtn = el('button', 'jump', '@@INIT');
  initBtn.type = 'button';
  initBtn.addEventListener('click', () => devtools.jumpTo(-1));
  initial.append(initBtn);

  const items = l.entries.map((e, i) => {
    const li = el('li', 'entry' + (i === l.currentIndex ? ' current' : '') + (i > l.currentIndex ? ' future' : '') + (e.skipped ? ' skipped' : '') + (e.error ? ' errored' : ''));
    const jump = el('button', 'jump');
    jump.type = 'button';
    jump.append(el('span', 'type', e.action.type));
    const payload = { ...e.action };
    delete payload.type;
    if (Object.keys(payload).length) jump.append(el('span', 'payload', JSON.stringify(payload)));
    jump.addEventListener('click', () => devtools.jumpTo(i));
    const skip = el('button', 'skip', e.skipped ? 'Restore' : 'Skip');
    skip.type = 'button';
    skip.setAttribute('aria-label', `${e.skipped ? 'Restore' : 'Skip'} action ${e.action.type}`);
    skip.addEventListener('click', () => devtools.toggleAction(e.id));
    li.append(jump, skip);
    return li;
  });
  dbg.log.replaceChildren(initial, ...items);
  dbg.log.querySelector('.current')?.scrollIntoView({ block: 'nearest' });

  const now = currentState(l);
  const prev = l.currentIndex <= 0 ? l.initialState : l.entries[l.currentIndex - 1].state;
  dbg.state.textContent = JSON.stringify(now, null, 2);
  const changes = l.currentIndex === -1 ? [] : diffState(prev, now);
  dbg.diff.textContent = changes.length
    ? changes.map((c) => `${c.path}: ${JSON.stringify(c.before)} -> ${JSON.stringify(c.after)}`).join('\n')
    : l.currentIndex === -1 ? 'Initial state' : 'No state change';
}

dbg.slider.addEventListener('input', () => { stopPlay(); devtools.jumpTo(Number(dbg.slider.value) - 1); });
$('#back').addEventListener('click', () => { stopPlay(); devtools.stepBack(); });
$('#fwd').addEventListener('click', () => { stopPlay(); devtools.stepForward(); });
dbg.play.addEventListener('click', () => {
  if (playTimer) { stopPlay(); return; }
  devtools.jumpTo(-1);
  dbg.play.textContent = 'Stop';
  playTimer = setInterval(() => {
    const l = devtools.getLifted();
    if (l.currentIndex >= l.entries.length - 1) stopPlay(); else devtools.stepForward();
  }, 450);
});
dbg.pause.addEventListener('click', () => devtools.togglePause());
$('#dev-reset').addEventListener('click', () => { stopPlay(); devtools.reset(); });
$('#commit').addEventListener('click', () => devtools.commit());
$('#export').addEventListener('click', () => {
  const blob = new Blob([devtools.exportSession()], { type: 'application/json' });
  const a = el('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'session.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('#import').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try { devtools.importSession(await file.text()); } catch (err) { alert(`Could not import: ${err.message}`); }
  e.target.value = '';
});

store.subscribe(renderApp);
devtools.subscribe(renderDebugger);
renderApp();
renderDebugger();
