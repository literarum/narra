/* Undo/redo for the text of an entry. One step is one thing a person would call "one action":
   a burst of typing, a pause, a paste, a formatting command, an accepted suggestion. Pure logic, no DOM.

   Why not the browser's own history: it is lost whenever the text is changed by script (formatting, slash menu,
   inserting a photo), it differs between browsers, and on phones there is no shortcut for it at all. */

const DEFAULTS = {limit: 250, gapMs: 1100, charBudget: 2_500_000};

export function diffRange(a, b) {
  let s = 0;
  const max = Math.min(a.length, b.length);
  while (s < max && a.charCodeAt(s) === b.charCodeAt(s)) s++;
  let ea = a.length, eb = b.length;
  while (ea > s && eb > s && a.charCodeAt(ea - 1) === b.charCodeAt(eb - 1)) { ea--; eb--; }
  return {from: s, removed: a.slice(s, ea), added: b.slice(s, eb)};
}

/** Classify an edit so that only small, adjacent typing/deleting edits merge into one step. */
export function classify(prev, next) {
  const d = diffRange(prev, next);
  if (!d.removed && d.added) {
    if (d.added.length <= 2 && !/\n/.test(d.added)) return {kind: "type", ...d};
    return {kind: "block", ...d};
  }
  if (d.removed && !d.added && d.removed.length <= 2) return {kind: "erase", ...d};
  return {kind: "block", ...d};
}

export class TextHistory {
  constructor(initial = "", options = {}) {
    this.opt = {...DEFAULTS, ...options};
    this.reset(initial);
  }
  reset(text = "", sel = [text.length, text.length]) {
    this.states = [{value: text, sel: [...sel]}];
    this.at = 0;
    this.last = null; // {kind, end, time, ws}
    this.chars = text.length;
  }
  get value() { return this.states[this.at].value; }
  canUndo() { return this.at > 0; }
  canRedo() { return this.at < this.states.length - 1; }
  /** Break the current typing burst (called on caret jumps, blur, toolbar use). */
  seal() { this.last = null; }
  /** Record the text after an edit. `sel` is [start,end] of the caret afterwards. Returns false if nothing changed. */
  record(value, sel = [value.length, value.length], now = Date.now()) {
    const cur = this.states[this.at];
    if (value === cur.value) return false;
    const c = classify(cur.value, value);
    if (this.canRedo()) { // a new edit ends the redo branch
      for (let i = this.at + 1; i < this.states.length; i++) this.chars -= this.states[i].value.length;
      this.states.length = this.at + 1;
    }
    const startsNewWord = c.kind === "type" && /^\s/.test(c.added) && this.last && !this.last.ws;
    const merge = this.last && this.at > 0 && c.kind !== "block" && c.kind === this.last.kind
      && now - this.last.time <= this.opt.gapMs && !startsNewWord
      && (c.kind === "type" ? c.from === this.last.end : c.from + c.removed.length === this.last.end);
    if (merge) {
      this.chars += value.length - cur.value.length;
      this.states[this.at] = {value, sel: [...sel]};
    } else {
      this.states[this.at] = {...cur, sel: cur.sel}; // keep the caret the person had before this step
      this.states.push({value, sel: [...sel]});
      this.at++;
      this.chars += value.length;
    }
    this.last = {kind: c.kind, end: c.kind === "type" ? c.from + c.added.length : c.from, time: now, ws: c.kind === "type" && /\s$/.test(c.added)};
    this.trim();
    return true;
  }
  trim() {
    while ((this.states.length > this.opt.limit || this.chars > this.opt.charBudget) && this.at > 1) {
      this.chars -= this.states[0].value.length;
      this.states.shift();
      this.at--;
    }
  }
  undo() {
    if (!this.canUndo()) return null;
    const from = this.states[this.at].value;
    this.at--;
    this.last = null;
    const st = this.states[this.at];
    return {value: st.value, sel: this.caretAfter(from, st.value, st.sel)};
  }
  redo() {
    if (!this.canRedo()) return null;
    const from = this.states[this.at].value;
    this.at++;
    this.last = null;
    const st = this.states[this.at];
    return {value: st.value, sel: this.caretAfter(from, st.value, st.sel)};
  }
  /** Put the caret where the change happened, so the person sees what was undone. */
  caretAfter(from, to) {
    const d = diffRange(from, to);
    const pos = d.from + d.added.length;
    return [pos, pos];
  }
}
