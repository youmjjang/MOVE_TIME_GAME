(() => {
"use strict";

const $ = id => document.getElementById(id);
const canvas = $("game");
const ctx = canvas.getContext("2d");
const W = canvas.width, H = canvas.height;

const ui = {
  overlay:$("overlay"), overlayStage:$("overlayStage"), overlayTitle:$("overlayTitle"), overlayText:$("overlayText"),
  primaryBtn:$("primaryBtn"), secondaryBtn:$("secondaryBtn"), pauseBtn:$("pauseBtn"),
  stageMenuBtn:$("stageMenuBtn"), experimentBtn:$("experimentBtn"), stageGrid:$("stageGrid"),
  experimentBox:$("experimentBox"), resetExperimentBtn:$("resetExperimentBtn"), exportExperimentBtn:$("exportExperimentBtn"),
  aCount:$("aCount"), bCount:$("bCount"), motionToggle:$("motionToggle"), muteToggle:$("muteToggle"), resetSaveBtn:$("resetSaveBtn"),
  stageLabel:$("stageLabel"), statusText:$("statusText"), timeText:$("timeText"), movesText:$("movesText"),
  bestText:$("bestText"), modeText:$("modeText")
};

const SAVE_KEY = "move_time_save_v5";
const DEFAULT_SAVE = () => ({
  version: 5,
  best: {},
  reduceMotion: false,
  muted: false,
  experiment: { phase:"A", A:[], B:[] }
});

function validRun(r) {
  return r && typeof r==="object" &&
    (r.result==="clear" || r.result==="fail") &&
    Number.isFinite(r.used) && r.used>=0 &&
    Number.isInteger(r.moves) && r.moves>=0 &&
    typeof r.reason==="string";
}
function sanitizeSave(raw) {
  const d = DEFAULT_SAVE();
  if (!raw || typeof raw!=="object" || raw.version!==5) return d;
  if (raw.best && typeof raw.best==="object") {
    for (const [k,v] of Object.entries(raw.best)) {
      if (/^(?:[1-9]|10)$/.test(k) && Number.isFinite(v) && v>=0 && v<=30) d.best[k]=v;
    }
  }
  d.reduceMotion = raw.reduceMotion === true;
  d.muted = raw.muted === true;
  const e = raw.experiment;
  if (e && typeof e==="object") {
    d.experiment.A = Array.isArray(e.A) ? e.A.filter(validRun).slice(0,10) : [];
    d.experiment.B = Array.isArray(e.B) ? e.B.filter(validRun).slice(0,10) : [];
    d.experiment.phase = d.experiment.A.length<10 ? "A" : (d.experiment.B.length<10 ? "B" : "DONE");
  }
  return d;
}
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return DEFAULT_SAVE();
    return sanitizeSave(JSON.parse(raw));
  } catch {
    return DEFAULT_SAVE();
  }
}
function persist() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch {}
}

let save = loadSave();
let reduceMotion = save.reduceMotion;
let muted = save.muted;
ui.motionToggle.checked = reduceMotion;
ui.muteToggle.checked = muted;

// Web Audio로 짧은 효과음만 생성합니다. 외부 음원/API는 사용하지 않습니다.
let audioCtx = null;
let activeOscillators = [];

function ensureAudio() {
  if (muted) return null;
  try {
    if (!audioCtx) {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return null;
      audioCtx = new AudioCtor();
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  } catch {
    return null;
  }
}

function stopAllSounds() {
  for (const osc of activeOscillators) {
    try { osc.stop(); } catch {}
  }
  activeOscillators = [];
}

function tone(freq, duration, volume=0.045, delay=0) {
  if (muted) return;
  const ac = ensureAudio();
  if (!ac) return;

  try {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    const start = ac.currentTime + delay;
    const end = start + duration;

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(gain);
    gain.connect(ac.destination);

    activeOscillators.push(osc);
    osc.addEventListener("ended", () => {
      activeOscillators = activeOscillators.filter(o => o !== osc);
    }, { once: true });

    osc.start(start);
    osc.stop(end);
  } catch {}
}

function playSfx(kind) {
  if (muted) return;

  if (kind === "clear") {
    tone(660, 0.12, 0.04, 0);
    tone(880, 0.18, 0.04, 0.10);
  } else if (kind === "fail") {
    tone(180, 0.22, 0.04, 0);
  }
}

const CIRCLE = (x,y,r,axis,min,max,dir,speed) => ({type:"circle",x,y,r,axis,min,max,dir,speed});
const BAR = (x,y,w,h,axis,min,max,dir,speed) => ({type:"bar",x,y,w,h,axis,min,max,dir,speed});
const WALL = (x,y,w,h) => ({x,y,w,h});

const STAGES = {
  1:{name:"FIRST TICK", intro:"큰 적의 이동선을 보고 첫 구역을 통과하세요.", time:30, step:18, worldTick:.13,
    start:{x:55,y:250}, exit:{x:885,y:224,w:30,h:86},
    walls:[WALL(255,0,34,195),WALL(255,345,34,195),WALL(520,120,34,300),WALL(760,0,34,195),WALL(760,345,34,195)],
    hazards:[CIRCLE(380,95,24,"y",75,465,1,160),CIRCLE(650,440,25,"y",75,465,-1,168),CIRCLE(845,135,23,"y",80,455,1,175)]},

  2:{name:"GATE RUN", intro:"큰 원형 적들이 통로를 가로막습니다. 안전한 공간에서 시간을 진행시키세요.", time:28, step:18, worldTick:.13,
    start:{x:52,y:430}, exit:{x:884,y:58,w:30,h:78},
    walls:[WALL(180,110,34,430),WALL(355,0,34,355),WALL(530,185,34,355),WALL(705,0,34,355)],
    hazards:[CIRCLE(282.5,264,24,"y",99,444,1,155),CIRCLE(460,265,24,"y",95,445,-1,165),CIRCLE(635,265,24,"y",95,445,1,170),CIRCLE(810,265,24,"y",95,445,-1,178)]},

  3:{name:"CROSS SIGNAL", intro:"세로와 가로 위험 구간이 겹칩니다.", time:27, step:18, worldTick:.13,
    start:{x:52,y:78}, exit:{x:886,y:410,w:30,h:78},
    walls:[WALL(205,0,32,330),WALL(385,210,32,330),WALL(565,0,32,330),WALL(745,210,32,330)],
    hazards:[CIRCLE(300,120,24,"y",75,465,1,185),CIRCLE(480,420,24,"y",75,465,-1,190),CIRCLE(660,120,24,"y",75,465,1,195),
             CIRCLE(510,148,33,"x",320,795,1,205),CIRCLE(510,403,33,"x",320,795,-1,212)]},

  4:{name:"NARROW BEAT", intro:"통로가 좁아집니다. 무작정 직진하면 막힙니다.", time:25, step:18, worldTick:.13,
    start:{x:50,y:445}, exit:{x:890,y:50,w:28,h:72},
    walls:[WALL(130,130,34,410),WALL(265,0,34,340),WALL(400,200,34,340),WALL(535,0,34,340),WALL(670,200,34,340),WALL(805,0,34,340)],
    hazards:[CIRCLE(220,230,24,"y",90,470,1,205),CIRCLE(355,340,24,"y",90,470,-1,212),CIRCLE(490,230,24,"y",90,470,1,220),
             CIRCLE(625,340,24,"y",90,470,-1,228),CIRCLE(760,230,24,"y",90,470,1,236),CIRCLE(860,380,25,"y",75,455,-1,238)]},

  5:{name:"DOUBLE SWEEP", intro:"큰 원형 적들이 중앙을 가로질러 훑습니다.", time:24, step:18, worldTick:.13,
    start:{x:50,y:255}, exit:{x:890,y:230,w:28,h:78},
    walls:[WALL(225,0,34,160),WALL(225,380,34,160),WALL(475,145,34,250),WALL(725,0,34,160),WALL(725,380,34,160)],
    hazards:[CIRCLE(420,200,34,"x",370,750,1,230),CIRCLE(710,340,34,"x",410,810,-1,238),
             CIRCLE(350,435,24,"y",75,465,-1,220),CIRCLE(650,100,24,"y",75,465,1,225)]},

  6:{name:"MOVING DOORS", intro:"원형 적들의 움직임 사이에 생기는 틈을 이용하세요.", time:23, step:18, worldTick:.13,
    start:{x:52,y:430}, exit:{x:885,y:55,w:30,h:78},
    walls:[
      WALL(165,0,30,250),WALL(165,365,30,175),
      WALL(350,0,30,70),WALL(350,205,30,335),
      WALL(535,0,30,250),WALL(535,365,30,175),
      WALL(720,0,30,70),WALL(720,205,30,335)
    ],
    hazards:[CIRCLE(195,305,24,"y",265,355,1,110),CIRCLE(380,135,24,"y",95,180,-1,115),CIRCLE(565,305,24,"y",265,355,1,120),
             CIRCLE(750,135,24,"y",95,180,-1,125),CIRCLE(815,400,25,"y",80,455,-1,245)]},

  7:{name:"CROSS WAVE", intro:"좌우로 교차하는 적이 본격적으로 등장합니다. 옆으로만 피해서는 통과하기 어렵습니다.", time:23, step:18, worldTick:.13,
    start:{x:50,y:440}, exit:{x:888,y:50,w:30,h:74},
    walls:[
      WALL(210,0,34,135),WALL(210,335,34,205),
      WALL(455,120,34,300),
      WALL(700,0,34,135),WALL(700,335,34,205)
    ],
    hazards:[
      CIRCLE(180,125,29,"x",95,405,1,225),
      CIRCLE(390,205,28,"x",235,650,-1,235),
      CIRCLE(590,315,29,"x",350,820,1,245),
      CIRCLE(760,415,28,"x",520,900,-1,255),
      CIRCLE(325,85,26,"x",95,585,-1,238),
      CIRCLE(635,455,26,"x",365,900,1,248),
      CIRCLE(530,120,25,"y",80,455,1,205)
    ]},

  8:{name:"CROSS GRID", intro:"좌우 교차 적이 두 겹으로 늘어나고 세로 적이 빈틈을 막습니다.", time:22, step:18, worldTick:.13,
    start:{x:50,y:270}, exit:{x:888,y:270,w:30,h:78},
    walls:[
      WALL(240,0,34,150),WALL(240,390,34,150),
      WALL(480,170,34,200),
      WALL(720,0,34,150),WALL(720,390,34,150)
    ],
    hazards:[
      CIRCLE(220,110,28,"x",80,430,1,245),
      CIRCLE(500,110,28,"x",300,780,-1,255),
      CIRCLE(735,110,27,"x",520,900,1,265),
      CIRCLE(310,270,28,"x",90,620,-1,258),
      CIRCLE(650,270,28,"x",350,900,1,268),
      CIRCLE(230,430,27,"x",80,470,-1,255),
      CIRCLE(610,430,27,"x",340,900,1,272),
      CIRCLE(380,180,25,"y",85,455,1,225),
      CIRCLE(820,365,25,"y",85,455,-1,235)
    ]},

  9:{name:"CROSS PRESSURE", intro:"넓은 좌우 교차 구간이 연속으로 이어집니다. 안전지대가 짧습니다.", time:21, step:18, worldTick:.13,
    start:{x:50,y:445}, exit:{x:890,y:48,w:28,h:72},
    walls:[
      WALL(165,150,34,390),
      WALL(330,0,34,330),
      WALL(495,210,34,330),
      WALL(660,0,34,330),
      WALL(825,210,34,330)
    ],
    hazards:[
      CIRCLE(210,95,30,"x",80,470,1,270),
      CIRCLE(450,95,29,"x",250,700,-1,280),
      CIRCLE(735,95,30,"x",510,900,1,292),
      CIRCLE(260,255,29,"x",95,530,-1,278),
      CIRCLE(560,255,30,"x",300,820,1,290),
      CIRCLE(805,255,29,"x",555,905,-1,302),
      CIRCLE(250,420,30,"x",80,520,1,285),
      CIRCLE(610,420,29,"x",330,900,-1,298),
      CIRCLE(415,175,25,"y",85,455,1,245)
    ]},

 10:{name:"TIME CORE", intro:"최종 구역. 좌우 교차 적과 세로 적이 동시에 빈틈을 압박합니다.", time:20, step:18, worldTick:.13,
    start:{x:48,y:270}, exit:{x:895,y:235,w:28,h:80},
    walls:[
      WALL(185,0,34,155),WALL(185,385,34,155),
      WALL(365,145,34,250),
      WALL(545,0,34,155),WALL(545,385,34,155),
      WALL(725,145,34,250)
    ],
    hazards:[
      CIRCLE(180,105,31,"x",80,430,1,295),
      CIRCLE(490,105,30,"x",250,730,-1,305),
      CIRCLE(770,105,31,"x",520,900,1,315),

      CIRCLE(285,270,30,"x",80,540,-1,300),
      CIRCLE(600,270,31,"x",330,850,1,312),
      CIRCLE(835,270,30,"x",590,905,-1,322),

      CIRCLE(210,435,30,"x",80,470,1,305),
      CIRCLE(525,435,30,"x",300,760,-1,315),
      CIRCLE(790,435,31,"x",540,905,1,325),

      CIRCLE(455,155,26,"y",80,455,1,265),
      CIRCLE(650,385,26,"y",80,455,-1,275)
    ]}
};

// 난이도 비교용 고정 코스. A/B 사이에서 바뀌는 값은 speed multiplier 하나뿐입니다.
const EXP_STAGE = {
  name:"DIFFICULTY TEST",
  intro:"같은 코스를 A 10회, B 10회 플레이합니다. 바뀌는 값은 적 이동 속도 하나뿐입니다.",
  time:15,
  step:18,
  worldTick:.13,
  start:{x:52,y:255},
  exit:{x:884,y:230,w:30,h:80},
  walls:[
    WALL(205,0,30,155),WALL(205,385,30,155),
    WALL(475,170,30,200),
    WALL(745,0,30,155),WALL(745,385,30,155)
  ],
  hazards:[
    CIRCLE(315,105,18,"y",75,465,1,175),
    CIRCLE(585,435,18,"y",75,465,-1,190),
    CIRCLE(825,115,18,"y",75,465,1,205)
  ]
};

let currentStage = 1;
let mode = "normal"; // normal | experiment
let state = "ready"; // ready | playing | paused | won | lost | menu
let moveTimeLeft = STAGES[1].time;
let moves = 0;
let lastReason = "";
let flash = 0, shake = 0, particles = [];
let keys = Object.create(null);
let inputEvents = 0;

const PLAYER_SPEED = 235;
const FINAL_ENEMY_SPEED_MULTIPLIER = 1.18;
const player = {x:0,y:0,w:30,h:30};
let exit = {};
let walls = [];
let hazards = [];

function activeStage() { return mode==="experiment" ? EXP_STAGE : STAGES[currentStage]; }
function experimentPhase() {
  if (save.experiment.A.length<10) return "A";
  if (save.experiment.B.length<10) return "B";
  return "DONE";
}
function speedMultiplier() {
  if (mode!=="experiment") return FINAL_ENEMY_SPEED_MULTIPLIER;
  return experimentPhase()==="B" ? FINAL_ENEMY_SPEED_MULTIPLIER : 1.00;
}
function bestForStage() {
  return save.best[String(currentStage)] ?? null;
}

function copyStageData() {
  const s = activeStage();
  player.x=s.start.x; player.y=s.start.y;
  exit={...s.exit};
  walls=s.walls.map(w=>({...w}));
  hazards=s.hazards.map(h=>({...h}));
  moveTimeLeft=s.time;
  moves=0; inputEvents=0;
  lastReason=""; flash=0; shake=0; particles=[];
  keys=Object.create(null);
}

function updateHud() {
  ui.statusText.textContent = state.toUpperCase();
  ui.timeText.textContent = Math.max(0,moveTimeLeft).toFixed(1);
  ui.movesText.textContent = String(moves);
  ui.bestText.textContent = mode==="normal" && bestForStage()!=null ? `${bestForStage().toFixed(1)}s` : "-";
  ui.modeText.textContent = mode==="experiment" ? `TEST ${experimentPhase()}` : "FINAL B · 1.18×";
  ui.stageLabel.textContent = mode==="experiment" ? "DIFFICULTY TEST" : `STAGE ${String(currentStage).padStart(2,"0")} / 10`;
  ui.aCount.textContent = `${save.experiment.A.length} / 10`;
  ui.bCount.textContent = `${save.experiment.B.length} / 10`;
}

function showReady() {
  state="ready"; copyStageData(); updateHud();
  ui.overlay.classList.remove("hidden");
  ui.stageGrid.classList.add("hidden");
  ui.experimentBox.classList.toggle("hidden", mode!=="experiment");
  ui.primaryBtn.classList.remove("hidden");
  ui.secondaryBtn.classList.add("hidden");

  if (mode==="experiment") {
    const p=experimentPhase();
    ui.overlayStage.textContent="DIFFICULTY TEST";
    ui.overlayTitle.textContent = p==="DONE" ? "20회 기록 완료" : `TEST ${p}`;
    ui.overlayText.innerHTML = p==="DONE"
      ? "A 10회 + B 10회가 모두 기록되었습니다.<br>CSV 저장 버튼으로 제출용 표를 받을 수 있습니다."
      : `${EXP_STAGE.intro}<br>현재 조건: <b>${p==="A"?"A · 속도 1.00×":"B · 속도 1.18×"}</b>`;
    ui.primaryBtn.textContent = p==="DONE" ? "추가 플레이" : "실험 시작";
  } else {
    const s=activeStage();
    ui.overlayStage.textContent=`STAGE ${String(currentStage).padStart(2,"0")}`;
    ui.overlayTitle.textContent=s.name;
    ui.overlayText.innerHTML=`${s.intro}<br><b>${s.time}초</b> 안에 EXIT에 도착하세요.`;
    ui.primaryBtn.textContent="게임 시작";
  }
}

function startGame() {
  if (mode==="experiment" && experimentPhase()==="DONE") {
    // 완료 후 추가 플레이는 기록에 포함하지 않음
  }
  copyStageData();
  state="playing";
  ui.overlay.classList.add("hidden");
  ui.pauseBtn.textContent="일시정지";
  updateHud();
}

function pause(force=false) {
  if (!["playing","paused"].includes(state)) return;
  if (force && state==="playing") state="paused";
  else if (!force) state=state==="paused"?"playing":"paused";
  ui.pauseBtn.textContent=state==="paused"?"계속하기":"일시정지";
  updateHud();
}

function rectsOverlap(a,b){
  return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;
}
function circleRectCollision(c,r){
  const cx=Math.max(r.x,Math.min(c.x,r.x+r.w));
  const cy=Math.max(r.y,Math.min(c.y,r.y+r.h));
  const dx=c.x-cx,dy=c.y-cy;
  return dx*dx+dy*dy < c.r*c.r;
}
function hitHazard(h) {
  return h.type==="circle" ? circleRectCollision(h,player) : rectsOverlap(h,player);
}
function canMove(nx,ny){
  const r={x:nx,y:ny,w:player.w,h:player.h};
  if(nx<18||ny<18||nx+player.w>W-18||ny+player.h>H-18)return false;
  return !walls.some(w=>rectsOverlap(r,w));
}
function advanceHazards(dt){
  const mult=speedMultiplier();

  for(const h of hazards){
    const d=h.speed*mult*h.dir*dt;

    if(h.axis==="x"){
      h.x+=d;
      if(h.x<=h.min){h.x=h.min;h.dir=1}
      else if(h.x>=h.max){h.x=h.max;h.dir=-1}
    }else{
      h.y+=d;
      if(h.y<=h.min){h.y=h.min;h.dir=1}
      else if(h.y>=h.max){h.y=h.max;h.dir=-1}
    }
  }
}

function movePlayerContinuous(dx,dy){
  let moved=false;

  const nx=player.x+dx;
  if(canMove(nx,player.y)){
    player.x=nx;
    moved = moved || Math.abs(dx)>0.0001;
  }

  const ny=player.y+dy;
  if(canMove(player.x,ny)){
    player.y=ny;
    moved = moved || Math.abs(dy)>0.0001;
  }

  return moved;
}

function updateGame(dt){
  if(state!=="playing") return;

  let x=0, y=0;

  if(keys["arrowleft"] || keys["a"]) x-=1;
  if(keys["arrowright"] || keys["d"]) x+=1;
  if(keys["arrowup"] || keys["w"]) y-=1;
  if(keys["arrowdown"] || keys["s"]) y+=1;

  const wantsMove = x!==0 || y!==0;

  if(!wantsMove){
    return; // 핵심 규칙: 내가 멈추면 시간과 적도 멈춘다.
  }

  const len=Math.hypot(x,y) || 1;
  x/=len;
  y/=len;

  const moved = movePlayerContinuous(
    x*PLAYER_SPEED*dt,
    y*PLAYER_SPEED*dt
  );

  // 벽을 향해 밀고만 있을 때는 세상을 진행시키지 않는다.
  if(!moved) return;

  // 실제 플레이어가 움직인 프레임에만 시간과 적이 진행된다.
  moveTimeLeft -= dt;
  advanceHazards(dt);

  if(hazards.some(hitHazard)){
    lastReason="적 충돌";
    finish(false);
    return;
  }

  if(rectsOverlap(player,exit)){
    finish(true);
    return;
  }

  if(moveTimeLeft<=0){
    moveTimeLeft=0;
    lastReason="시간 초과";
    finish(false);
    return;
  }

  updateHud();
}

function burst(x,y){
  if(reduceMotion)return;
  for(let i=0;i<26;i++){
    const a=Math.random()*Math.PI*2,sp=35+Math.random()*120;
    particles.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:.35+Math.random()*.45,size:2+Math.random()*4});
  }
}
function recordExperiment(clear){
  const phase=experimentPhase();
  if(phase==="DONE")return;
  const used=Math.max(0,activeStage().time-moveTimeLeft);
  const row={result:clear?"clear":"fail",used:+used.toFixed(1),moves,reason:clear?"clear":lastReason};
  save.experiment[phase].push(row);
  save.experiment.phase=experimentPhase();
  persist();
}

function finish(clear){
  state=clear?"won":"lost";
  const used=Math.max(0,activeStage().time-moveTimeLeft);

  if(clear){
    flash=1;
    burst(exit.x+exit.w/2,exit.y+exit.h/2);
    playSfx("clear");
    if(mode==="normal"){
      const key=String(currentStage), old=save.best[key];
      if(!Number.isFinite(old) || used<old){save.best[key]=+used.toFixed(1);persist()}
    }else recordExperiment(true);
  }else{
    shake=reduceMotion?0:12;
    playSfx("fail");
    if(mode==="experiment") recordExperiment(false);
  }

  ui.overlay.classList.remove("hidden");
  ui.stageGrid.classList.add("hidden");
  ui.experimentBox.classList.toggle("hidden",mode!=="experiment");
  ui.primaryBtn.classList.remove("hidden");
  ui.secondaryBtn.classList.add("hidden");

  if(mode==="experiment"){
    const nextPhase=experimentPhase();
    ui.overlayStage.textContent="DIFFICULTY TEST";
    ui.overlayTitle.textContent=clear?"기록 저장됨":"실패 기록 저장됨";
    ui.overlayText.innerHTML=
      `결과: <b>${clear?"CLEAR":lastReason}</b> · 사용시간 ${used.toFixed(1)}초 · 입력 ${moves}회<br>`+
      (nextPhase==="DONE" ? "A 10회 + B 10회 기록이 완료되었습니다." : `다음 기록: TEST ${nextPhase}`);
    ui.primaryBtn.textContent=nextPhase==="DONE"?"추가 플레이":"다음 실험";
  }else if(clear){
    ui.overlayStage.textContent=`STAGE ${String(currentStage).padStart(2,"0")}`;
    ui.overlayTitle.textContent=currentStage===10?"ALL CLEAR":"STAGE CLEAR";
    ui.overlayText.innerHTML=`사용 이동시간 <b>${used.toFixed(1)}초</b> · 입력 ${moves}회`+
      (currentStage<10?`<br>ENTER로 Stage ${currentStage+1} 진행`:"<br>10개 스테이지를 모두 통과했습니다.");
    if(currentStage<10){
      ui.primaryBtn.classList.add("hidden");
      ui.secondaryBtn.classList.remove("hidden");
      ui.secondaryBtn.textContent=`Stage ${currentStage+1}`;
    }else{
      ui.primaryBtn.textContent="Stage 10 다시 시작";
    }
  }else{
    ui.overlayStage.textContent=`STAGE ${String(currentStage).padStart(2,"0")}`;
    ui.overlayTitle.textContent="TIME COLLAPSED";
    ui.overlayText.innerHTML=`실패 원인: <b>${lastReason}</b><br>ENTER로 현재 스테이지를 다시 시작합니다.`;
    ui.primaryBtn.textContent="다시 시작";
  }
  updateHud();
}

function handleEnter(){
  if(state==="ready"||state==="lost"){startGame();return}
  if(state==="paused"){pause();return}
  if(state==="won"){
    if(mode==="normal" && currentStage<10){currentStage++;showReady();startGame()}
    else startGame();
  }
}

function showStageMenu(){
  if(state==="playing") pause(true);
  state="menu";
  mode="normal";
  ui.overlay.classList.remove("hidden");
  ui.experimentBox.classList.add("hidden");
  ui.stageGrid.classList.remove("hidden");
  ui.primaryBtn.classList.add("hidden");
  ui.secondaryBtn.classList.add("hidden");
  ui.overlayStage.textContent="STAGE SELECT";
  ui.overlayTitle.textContent="스테이지 선택";
  ui.overlayText.textContent="1~10 중 원하는 스테이지를 선택하세요.";
  updateHud();
}

function showExperiment(){
  if(state==="playing") pause(true);
  mode="experiment";
  showReady();
}

function resetAllSave(){
  save=DEFAULT_SAVE();
  reduceMotion=false;
  muted=false;
  ui.motionToggle.checked=false;
  ui.muteToggle.checked=false;
  stopAllSounds();
  persist();
  showReady();
}
function resetExperiment(){
  save.experiment={phase:"A",A:[],B:[]}; persist();
  mode="experiment"; showReady();
}

function median(vals){
  if(!vals.length)return "";
  const s=[...vals].sort((a,b)=>a-b),m=Math.floor(s.length/2);
  return s.length%2?s[m]:(s[m-1]+s[m])/2;
}
function exportExperiment(){
  const rows=[];
  rows.push(["group","trial","result","used_time_sec","move_inputs","failure_reason"]);
  for(const g of ["A","B"]){
    save.experiment[g].forEach((r,i)=>rows.push([g,i+1,r.result,r.used,r.moves,r.reason]));
  }
  rows.push([]);
  rows.push(["setting","A","B"]);
  rows.push(["enemy_speed_multiplier","1.00","1.18"]);
  rows.push(["map","Fixed test course","Fixed test course"]);
  rows.push(["time_limit",String(EXP_STAGE.time),String(EXP_STAGE.time)]);
  rows.push(["player_step",String(EXP_STAGE.step),String(EXP_STAGE.step)]);
  rows.push(["world_tick",String(EXP_STAGE.worldTick),String(EXP_STAGE.worldTick)]);
  const aTimes=save.experiment.A.map(r=>r.used), bTimes=save.experiment.B.map(r=>r.used);
  rows.push(["median_used_time",String(median(aTimes)),String(median(bTimes))]);
  rows.push(["clear_count",String(save.experiment.A.filter(r=>r.result==="clear").length),String(save.experiment.B.filter(r=>r.result==="clear").length)]);

  const csv=rows.map(row=>row.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(",")).join("\n");
  const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download="move_time_difficulty_20plays.csv";
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),0);
}

function updateEffects(dt){
  if(reduceMotion){particles=[];shake=0;flash=0;return}
  for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt}
  particles=particles.filter(p=>p.life>0);
  shake=Math.max(0,shake-28*dt);
  flash=Math.max(0,flash-2.5*dt);
}

function draw(){
  const s=activeStage();
  ctx.save();
  const sx=reduceMotion?0:(Math.random()-.5)*shake, sy=reduceMotion?0:(Math.random()-.5)*shake;
  ctx.translate(sx,sy);
  ctx.fillStyle = currentStage>=8 && mode==="normal" ? "#120c14" : "#090d16";
  ctx.fillRect(-20,-20,W+40,H+40);

  ctx.strokeStyle="rgba(255,255,255,.035)";
  ctx.lineWidth=1;
  for(let x=20;x<W;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke()}
  for(let y=20;y<H;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}

  for(const w of walls){
    ctx.fillStyle="#242c3d";ctx.fillRect(w.x,w.y,w.w,w.h);
    ctx.fillStyle="rgba(255,255,255,.075)";ctx.fillRect(w.x+4,w.y+4,4,Math.max(0,w.h-8));
  }

  for(const h of hazards){
    ctx.save();
    ctx.strokeStyle="rgba(255,88,116,.18)";ctx.lineWidth=2;
    ctx.beginPath();
    if(h.axis==="x"){
      const cy=h.type==="circle"?h.y:h.y+h.h/2;
      ctx.moveTo(h.min,cy);ctx.lineTo(h.max+(h.type==="bar"?h.w:0),cy);
    }else{
      const cx=h.type==="circle"?h.x:h.x+h.w/2;
      ctx.moveTo(cx,h.min);ctx.lineTo(cx,h.max+(h.type==="bar"?h.h:0));
    }
    ctx.stroke();
    ctx.fillStyle="#ff5e78";
    ctx.beginPath();
    ctx.arc(h.x,h.y,h.r,0,Math.PI*2);
    ctx.fill();

    ctx.fillStyle="rgba(255,255,255,.86)";
    ctx.beginPath();
    ctx.arc(h.x-7,h.y-5,3,0,Math.PI*2);
    ctx.arc(h.x+7,h.y-5,3,0,Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  const pulse=reduceMotion?0:(Math.sin(performance.now()/260)+1)*.5;
  ctx.fillStyle=`rgba(124,245,199,${.14+pulse*.08})`;ctx.fillRect(exit.x-9,exit.y-9,exit.w+18,exit.h+18);
  ctx.fillStyle="#7cf5c7";ctx.fillRect(exit.x,exit.y,exit.w,exit.h);
  ctx.fillStyle="#07110e";ctx.font="bold 11px system-ui";ctx.textAlign="center";ctx.fillText("EXIT",exit.x+exit.w/2,exit.y-11);

  ctx.fillStyle="#edf3ff";ctx.fillRect(player.x,player.y,player.w,player.h);
  ctx.fillStyle="#090d16";ctx.fillRect(player.x+6,player.y+8,4,4);ctx.fillRect(player.x+20,player.y+8,4,4);
  ctx.fillStyle="#7cf5c7";ctx.fillRect(player.x+9,player.y+21,12,3);

  ctx.fillStyle="#7cf5c7";
  for(const p of particles){ctx.globalAlpha=Math.max(0,p.life);ctx.fillRect(p.x,p.y,p.size,p.size)}
  ctx.globalAlpha=1;

  if(state==="playing"){
    ctx.fillStyle="rgba(124,245,199,.8)";ctx.font="700 14px system-ui";ctx.textAlign="center";ctx.fillText("TIME MOVES ONLY WHEN YOU MOVE",W/2,28);
  }
  ctx.restore();

  if(flash>0){
    ctx.fillStyle=`rgba(124,245,199,${flash*.18})`;ctx.fillRect(0,0,W,H);
  }
  if(state==="paused"){
    ctx.fillStyle="rgba(5,7,11,.66)";ctx.fillRect(0,0,W,H);
    ctx.fillStyle="#f7f9fc";ctx.font="800 31px system-ui";ctx.textAlign="center";ctx.fillText("PAUSED",W/2,H/2-8);
    ctx.fillStyle="#9aa7ba";ctx.font="500 14px system-ui";ctx.fillText("ENTER 또는 P로 계속하기",W/2,H/2+22);
  }
}

let prev=performance.now();
function loop(now){
  const dt=Math.min((now-prev)/1000,.033);
  prev=now;

  updateGame(dt);
  updateEffects(dt);
  draw();

  requestAnimationFrame(loop);
}

function isMoveKey(k){
  return ["arrowleft","arrowright","arrowup","arrowdown","w","a","s","d"].includes(k);
}

window.addEventListener("keydown",e=>{
  const k=e.key.toLowerCase();

  if(isMoveKey(k) || ["enter","p","r"].includes(k)){
    e.preventDefault();
  }

  if(k==="enter"){
    if(!e.repeat) handleEnter();
    return;
  }

  if(k==="p"){
    if(!e.repeat) pause();
    return;
  }

  if(k==="r"){
    if(!e.repeat) startGame();
    return;
  }

  if(isMoveKey(k)){
    // 키를 처음 누른 순간만 입력 이벤트 1회로 기록.
    // 브라우저 자동 repeat는 별도 동작을 중복 생성하지 않는다.
    if(!keys[k] && !e.repeat){
      inputEvents += 1;
      moves = inputEvents;
      updateHud();
    }
    keys[k]=true;
  }
},{passive:false});

window.addEventListener("keyup",e=>{
  const k=e.key.toLowerCase();
  if(isMoveKey(k)){
    e.preventDefault();
    keys[k]=false;
  }
},{passive:false});

window.addEventListener("blur",()=>{
  keys=Object.create(null);
  if(state==="playing") pause(true);
});

document.addEventListener("visibilitychange",()=>{
  if(document.hidden){
    keys=Object.create(null);
    if(state==="playing") pause(true);
  }
});

ui.primaryBtn.addEventListener("click",startGame);
ui.secondaryBtn.addEventListener("click",()=>{
  if(mode==="normal"&&currentStage<10){currentStage++;showReady();startGame()}
});
ui.pauseBtn.addEventListener("click",()=>pause());
ui.stageMenuBtn.addEventListener("click",showStageMenu);
ui.experimentBtn.addEventListener("click",showExperiment);
ui.motionToggle.addEventListener("change",()=>{
  reduceMotion=ui.motionToggle.checked;
  save.reduceMotion=reduceMotion;
  persist();
  if(reduceMotion){particles=[];shake=0;flash=0}
});

ui.muteToggle.addEventListener("change",()=>{
  muted=ui.muteToggle.checked;
  save.muted=muted;
  persist();

  // 재생 중인 효과가 있어도 음소거를 켜는 즉시 멈춥니다.
  if(muted) stopAllSounds();
});
ui.resetSaveBtn.addEventListener("click",resetAllSave);
ui.resetExperimentBtn.addEventListener("click",resetExperiment);
ui.exportExperimentBtn.addEventListener("click",exportExperiment);

document.querySelectorAll("[data-stage]").forEach(btn=>{
  btn.addEventListener("click",()=>{
    currentStage=Number(btn.dataset.stage);mode="normal";showReady();
  });
});

showReady();
requestAnimationFrame(loop);
})();
