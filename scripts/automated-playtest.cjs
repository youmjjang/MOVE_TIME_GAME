const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
let source = fs.readFileSync(path.join(root, "game.js"), "utf8");

const injection = `
globalThis.__MOVE_TIME_TEST__ = {
  showExperiment,
  startGame,
  keyDown(key) {
    for (const fn of window.__listeners.keydown || []) fn({key, repeat:false, preventDefault(){}});
  },
  keyUp(key) {
    for (const fn of window.__listeners.keyup || []) fn({key, repeat:false, preventDefault(){}});
  },
  step(milliseconds) {
    globalThis.__testNow += milliseconds;
    const callback = globalThis.__nextFrame;
    globalThis.__nextFrame = null;
    if (callback) callback(globalThis.__testNow);
  },
  snapshot() {
    return {
      state,
      player:{...player},
      exit:{...exit},
      hazards:hazards.map(h => ({...h})),
      moveTimeLeft,
      moves,
      experiment:JSON.parse(JSON.stringify(save.experiment))
    };
  }
};
`;

source = source.replace(/\n\}\)\(\);\s*$/, `${injection}\n})();\n`);

class ClassList {
  constructor() { this.values = new Set(); }
  add(...values) { values.forEach(value => this.values.add(value)); }
  remove(...values) { values.forEach(value => this.values.delete(value)); }
  toggle(value, force) {
    if (force === true) { this.values.add(value); return true; }
    if (force === false) { this.values.delete(value); return false; }
    if (this.values.has(value)) { this.values.delete(value); return false; }
    this.values.add(value); return true;
  }
}

function element() {
  return {
    classList:new ClassList(),
    checked:false,
    textContent:"",
    innerHTML:"",
    addEventListener(){},
    appendChild(){},
    remove(){},
    click(){}
  };
}

const elements = new Map();
const context2d = new Proxy({}, { get(target, key) {
  if (!(key in target)) target[key] = () => {};
  return target[key];
}, set(target, key, value) { target[key] = value; return true; } });
const canvas = element();
canvas.width = 960;
canvas.height = 540;
canvas.getContext = () => context2d;
elements.set("game", canvas);

global.__testNow = 0;
global.__nextFrame = null;
global.performance = { now:() => global.__testNow };
global.requestAnimationFrame = callback => { global.__nextFrame = callback; return 1; };

const storage = new Map();
global.localStorage = {
  getItem:key => storage.has(key) ? storage.get(key) : null,
  setItem:(key, value) => storage.set(key, String(value)),
  removeItem:key => storage.delete(key)
};

global.window = {
  __listeners:Object.create(null),
  addEventListener(type, handler) {
    (this.__listeners[type] ||= []).push(handler);
  }
};

global.document = {
  hidden:false,
  body:element(),
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  },
  querySelectorAll() { return []; },
  addEventListener(){},
  createElement(){ return element(); }
};

global.Blob = class Blob {};
global.URL = { createObjectURL:() => "blob:test", revokeObjectURL(){} };

vm.runInThisContext(source, {filename:"game.js"});
const game = global.__MOVE_TIME_TEST__;
game.showExperiment();

const lanes = [124, 378, 132, 386, 116, 394, 128, 382, 120, 390];
let activeKeys = new Set();

function setKeys(next) {
  for (const key of activeKeys) if (!next.has(key)) game.keyUp(key);
  for (const key of next) if (!activeKeys.has(key)) game.keyDown(key);
  activeKeys = next;
}

function moveTo(targetX, targetY, maxFrames=420) {
  for (let frame=0; frame<maxFrames; frame++) {
    const current = game.snapshot();
    if (current.state !== "playing") break;
    const dx = targetX - current.player.x;
    const dy = targetY - current.player.y;
    if (Math.abs(dx) < 4.5 && Math.abs(dy) < 4.5) break;

    const keys = new Set();
    if (dx > 4.5) keys.add("d");
    else if (dx < -4.5) keys.add("a");
    if (dy > 4.5) keys.add("s");
    else if (dy < -4.5) keys.add("w");
    setKeys(keys);
    game.step(1000/60);
  }
  setKeys(new Set());
}

function playTrial(lane) {
  game.startGame();
  const route = [
    [258,255],
    [258,lane],
    [535,lane],
    [535,255],
    [810,255],
    [892,250]
  ];
  for (const [x,y] of route) moveTo(x,y);
  let snapshot = game.snapshot();
  if (snapshot.state === "playing") moveTo(910,250,120);
  snapshot = game.snapshot();
  if (snapshot.state === "playing") {
    throw new Error("Trial did not reach a terminal state");
  }
}

for (let i=0; i<20; i++) playTrial(lanes[i % lanes.length]);

const result = game.snapshot().experiment;
if (result.A.length !== 10 || result.B.length !== 10) {
  throw new Error(`Expected 10 A and 10 B runs, received ${result.A.length} and ${result.B.length}`);
}

const median = values => {
  const sorted = [...values].sort((a,b) => a-b);
  const middle = Math.floor(sorted.length/2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle-1] + sorted[middle]) / 2;
};

const rows = [["group","trial","result","used_time_sec","move_inputs","failure_reason"]];
for (const group of ["A","B"]) {
  result[group].forEach((run, index) => rows.push([
    group,index+1,run.result,run.used,run.moves,run.reason
  ]));
}
rows.push([]);
rows.push(["setting","A","B"]);
rows.push(["enemy_speed_multiplier","1.00","1.18"]);
rows.push(["course","Fixed test course","Fixed test course"]);
rows.push(["time_limit_sec","15","15"]);
rows.push(["player_speed","235","235"]);
rows.push(["clear_count",
  result.A.filter(run => run.result === "clear").length,
  result.B.filter(run => run.result === "clear").length
]);
rows.push(["median_used_time_sec",
  median(result.A.map(run => run.used)),
  median(result.B.map(run => run.used))
]);

const csv = rows.map(row => row.map(value => {
  return `"${String(value ?? "").replaceAll('"','""')}"`;
}).join(",")).join("\n") + "\n";

const evidenceDir = path.join(root, "evidence");
fs.mkdirSync(evidenceDir, {recursive:true});
fs.writeFileSync(path.join(evidenceDir, "PLAYTEST_RESULTS.csv"), "\ufeff" + csv, "utf8");

const summary = {
  A:{
    clearCount:result.A.filter(run => run.result === "clear").length,
    median:median(result.A.map(run => run.used)),
    reasons:result.A.reduce((acc, run) => ((acc[run.reason]=(acc[run.reason]||0)+1),acc),{})
  },
  B:{
    clearCount:result.B.filter(run => run.result === "clear").length,
    median:median(result.B.map(run => run.used)),
    reasons:result.B.reduce((acc, run) => ((acc[run.reason]=(acc[run.reason]||0)+1),acc),{})
  }
};

console.log(JSON.stringify(summary, null, 2));
