/* ==========================================================================
   THE MIND LAB — shared arcade core.
   Browser only: no build step, no dependencies, no network, no backend.
   index.html loads this lazily the first time the arcade is opened.

   GAME CONTRACT — a game module calls MindLab.register(id, impl) where impl is
   { start(api), next(api), rules(api) } and is handed a shell it renders into:

     api.host            the element the game must render into
     api.mode            'solo' | 'coop' | 'versus'
     api.difficulty      'Easy' | 'Medium' | 'Hard' | 'Expert'
     api.players         [ {i, name, score, solved, wrong, hints} ]   length 1 or 2
     api.turn            index of the player who is holding the device
     api.current()       the player object for api.turn
     api.nextTurn()      pass the device, updates the indicator
     api.setLevel(n, label, total)   starts level n; resets moves/hints/wrong/timer
     api.level           the index of the level now on the board
     api.locked          true once this level has been solved or skipped
     api.moves           number of actions taken on the current level
     api.bumpMoves(k)    add to the move counter
     api.setPar(ms, moves)  what a clean solve should look like, for bonuses
     api.hint()          spends a hint, shows it, applies the penalty
     api.setHint(text | fn)  the hint copy for this level (called by api.hint)
     api.hintsLeft       hints remaining in the run
     api.explain(text)   the "here is what was going on" copy for this level
     api.say(text)       one-line status under the stage
     api.solved({timeMs, parMs, moves, par, wrong})  -> points awarded
     api.failed(text)    a wrong attempt: penalty, sound, status line
     api.skip()          walk away from this level for the skip penalty
     api.onReset(fn)     the shell's Restart button calls fn(levelIndex)
     api.finish()        end the run and show the scoreboard
     api.showBrief(first) the rules sheet
     api.h / api.esc / api.sfx / api.reduced

   Flow: start(api) renders level 0 and must call api.onReset + api.setLevel.
   The shell calls next(api) after a solve or a skip, and resetFn(levelIndex) on
   Restart — so a level has to be re-renderable from its index alone.

   Every level must also be solvable without a human: box and glitch levels ship
   a solve(api) that plays the intended solution through the same api, which the
   test harness runs to prove no level is impossible or left unfinished.
   ========================================================================== */
(function () {
    'use strict';
    if (window.MindLab) return;

    const KEY = 'ml-progress-v1';
    const DIFFS = ['Easy', 'Medium', 'Hard', 'Expert'];

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
        ));
    }
    function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }
    function num(v, d) { return Number.isFinite(Number(v)) ? Number(v) : (d || 0); }

    /* ------------------------------------------------------------- manifest */
    // Kept here so the landing page never has to load a game module to render.
    const MANIFEST = [
        {
            id: 'box', file: 'arcade/impossible-box.js', icon: 'fa-cube', accent: '#4cc9f0',
            title: 'The Impossible Box',
            tagline: 'Mechanisms, symbols, combination locks.',
            blurb: 'Switches that only work in the right order, symbols that mean something, and a code you assemble from two corners of the same box.',
            difficulties: DIFFS, modes: ['solo', 'coop', 'versus'], levels: 12
        },
        {
            id: 'grid', file: 'arcade/brain-grid.js', icon: 'fa-brain', accent: '#9d4edd',
            title: 'Brain Grid',
            tagline: 'Logic, numbers, patterns, space.',
            blurb: 'Sequences, odd-one-out, grid deduction, substitution, spatial order. Every one authored by hand, with an answer that is verified and an explanation you get to read.',
            difficulties: DIFFS, modes: ['solo', 'versus'], levels: 8
        },
        {
            id: 'glitch', file: 'arcade/glitch-reality.js', icon: 'fa-wand-magic-sparkles', accent: '#06d6a0',
            title: 'Glitch the Reality',
            tagline: 'The instruction is doing its best to mislead you.',
            blurb: 'Rooms where the obvious reading is the trap. Drag the words, click the decoration, resize the thing you were told not to touch.',
            difficulties: ['Easy', 'Medium', 'Hard'], modes: ['solo', 'coop', 'versus'], levels: 20
        }
    ];
    const BY_ID = {};
    MANIFEST.forEach(m => { BY_ID[m.id] = m; });

    /* -------------------------------------------------------------- badges */
    const BADGES = {
        'first-breakthrough': { name: 'First Breakthrough', icon: 'fa-bolt', note: 'Solved your very first puzzle anywhere in the lab.' },
        'pattern-hunter': { name: 'Pattern Hunter', icon: 'fa-diagram-project', note: 'Ten Brain Grid puzzles answered correctly.' },
        'logic-master': { name: 'Logic Master', icon: 'fa-medal', note: 'Cleared a Hard or Expert Brain Grid run.' },
        'reality-bender': { name: 'Reality Bender', icon: 'fa-rotate', note: 'Ten Glitch the Reality rooms cracked.' },
        'box-opener': { name: 'Box Opener', icon: 'fa-box-open', note: 'Finished every level of The Impossible Box.' },
        'perfect-run': { name: 'Perfect Run', icon: 'fa-gem', note: 'A whole run with not one hint spent.' },
        'quick-hand': { name: 'Quick Hand', icon: 'fa-stopwatch', note: 'Solved a level in under a quarter of its par time.' },
        'shared-brain': { name: 'Shared Brain', icon: 'fa-people-arrows', note: 'Finished a two-player run.' }
    };

    /* ------------------------------------------------------------- storage */
    function blank() {
        const games = {};
        MANIFEST.forEach(m => {
            games[m.id] = { plays: 0, solved: 0, unlocked: 0, best: {}, lastPlays: [] };
        });
        return { v: 1, settings: { sound: true }, badges: {}, seen: {}, games: games };
    }

    function normalise(input) {
        const out = blank();
        if (!input || typeof input !== 'object' || Array.isArray(input)) return out;

        const s = input.settings;
        if (s && typeof s === 'object' && typeof s.sound === 'boolean') out.settings.sound = s.sound;

        const b = input.badges;
        if (b && typeof b === 'object' && !Array.isArray(b)) {
            Object.keys(BADGES).forEach(function (id) { if (b[id]) out.badges[id] = num(b[id], Date.now()); });
        }

        const sn = input.seen;
        if (sn && typeof sn === 'object' && !Array.isArray(sn)) {
            MANIFEST.forEach(function (m) { if (sn[m.id]) out.seen[m.id] = 1; });
        }

        const g = input.games;
        if (g && typeof g === 'object' && !Array.isArray(g)) {
            MANIFEST.forEach(function (m) {
                const src = g[m.id];
                if (!src || typeof src !== 'object' || Array.isArray(src)) return;
                const dst = out.games[m.id];
                dst.plays = Math.max(0, Math.floor(num(src.plays)));
                dst.solved = Math.max(0, Math.floor(num(src.solved)));
                dst.unlocked = clamp(Math.floor(num(src.unlocked)), 0, m.levels);
                if (src.best && typeof src.best === 'object' && !Array.isArray(src.best)) {
                    Object.keys(src.best).forEach(function (k) {
                        const v = num(src.best[k], -1);
                        if (v >= 0) dst.best[String(k).slice(0, 24)] = Math.floor(v);
                    });
                }
                if (Array.isArray(src.lastPlays)) {
                    dst.lastPlays = src.lastPlays.slice(-8).map(function (r) {
                        return { score: Math.max(0, Math.floor(num(r && r.score))), mode: String((r && r.mode) || 'solo').slice(0, 12), difficulty: String((r && r.difficulty) || 'Medium').slice(0, 12), at: num(r && r.at) };
                    });
                }
            });
        }
        return out;
    }

    // Storage can be full, blocked or simply missing (private windows, file://).
    // Everything still plays; only the persistent part is lost.
    let memoryOnly = false;
    let data = null;

    function load() {
        if (data) return data;
        let parsed = null;
        if (!memoryOnly) {
            try { parsed = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { parsed = null; }
        }
        data = normalise(parsed);
        return data;
    }

    function persist() {
        if (memoryOnly || !data) return false;
        try { localStorage.setItem(KEY, JSON.stringify(data)); return true; }
        catch (e) { memoryOnly = true; return false; }
    }

    function mutate(fn) {
        const d = load();
        fn(d);
        return persist();
    }

    function resetProgress() {
        data = blank();
        try { localStorage.removeItem(KEY); } catch (e) {}
        memoryOnly = false;
    }

    // Drop the in-memory copy and read the stored blob again.
    function reload() { data = null; memoryOnly = false; return load(); }

    function storageWorks() {
        if (memoryOnly) return false;
        try {
            localStorage.setItem(KEY + '-probe', '1');
            localStorage.removeItem(KEY + '-probe');
            return true;
        } catch (e) { memoryOnly = true; return false; }
    }

    /* ------------------------------------------------------------- scoring */
    const SCORING = {
        base: 100,
        timeBonus: 40,
        moveBonus: 40,
        hintCost: 25,
        wrongCost: 5,
        skipCost: 20,
        hintsPerRun: 3,
        multiplier: { Easy: 1, Medium: 1.25, Hard: 1.5, Expert: 1.8 }
    };

    // Never negative: penalties eat bonuses first, then the base, floor at zero.
    function scoreSolve(info) {
        const mult = SCORING.multiplier[info.difficulty] || 1;
        const parMs = Math.max(1, num(info.parMs, 90000));
        const timeMs = Math.max(0, num(info.timeMs));
        const speed = clamp(1 - timeMs / (2 * parMs), 0, 1) * SCORING.timeBonus;
        const par = Math.max(1, num(info.par, 1));
        const moves = Math.max(1, num(info.moves, par));
        const neat = clamp(par / moves, 0, 1) * SCORING.moveBonus;
        const gross = (SCORING.base + speed + neat) * mult;
        const cost = num(info.hints) * SCORING.hintCost + num(info.wrong) * SCORING.wrongCost;
        return {
            points: Math.max(0, Math.round(gross - cost)),
            speed: Math.round(speed), neat: Math.round(neat), cost: Math.round(cost),
            fast: timeMs > 0 && timeMs < parMs / 4
        };
    }

    function award(id, patch) {
        mutate(function (d) {
            const g = d.games[id] || (d.games[id] = { plays: 0, solved: 0, unlocked: 0, best: {}, lastPlays: [] });
            Object.keys(patch || {}).forEach(function (k) { g[k] = patch[k]; });
        });
    }

    function recordBest(id, key, score) {
        mutate(function (d) {
            const g = d.games[id];
            if (!g) return;
            if (!(g.best[key] >= score)) g.best[key] = score;
        });
    }

    function grantBadges(ids) {
        if (!ids || !ids.length) return [];
        const earned = [];
        mutate(function (d) {
            ids.forEach(function (id) {
                if (BADGES[id] && !d.badges[id]) { d.badges[id] = Date.now(); earned.push(id); }
            });
        });
        return earned;
    }

    /* ---------------------------------------------------------------- sfx */
    let actx = null;
    function audio() {
        if (!actx) {
            const C = window.AudioContext || window.webkitAudioContext;
            if (!C) return null;
            try { actx = new C(); } catch (e) { return null; }
        }
        if (actx.state === 'suspended') actx.resume();
        return actx;
    }

    function tone(freq, dur, type, gain, slideTo) {
        if (!load().settings.sound) return;
        const ctx = audio();
        if (!ctx) return;
        try {
            const osc = ctx.createOscillator();
            const amp = ctx.createGain();
            const now = ctx.currentTime;
            osc.type = type || 'triangle';
            osc.frequency.setValueAtTime(freq, now);
            if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), now + dur);
            amp.gain.setValueAtTime(0.0001, now);
            amp.gain.exponentialRampToValueAtTime(gain || 0.06, now + 0.012);
            amp.gain.exponentialRampToValueAtTime(0.0001, now + dur);
            osc.connect(amp); amp.connect(ctx.destination);
            osc.start(now); osc.stop(now + dur + 0.02);
        } catch (e) { /* audio is a garnish, never a dependency */ }
    }

    const sfx = {
        click: function () { tone(420, 0.05, 'square', 0.03); },
        move: function () { tone(300, 0.06, 'triangle', 0.035); },
        good: function () { tone(660, 0.12, 'sine', 0.06); setTimeout(function () { tone(880, 0.16, 'sine', 0.05); }, 90); },
        bad: function () { tone(180, 0.22, 'sawtooth', 0.045, 90); },
        unlock: function () { [523, 659, 784, 1046].forEach(function (f, i) { setTimeout(function () { tone(f, 0.18, 'triangle', 0.05); }, i * 70); }); },
        win: function () { [392, 523, 659, 784, 1046].forEach(function (f, i) { setTimeout(function () { tone(f, 0.26, 'sine', 0.055); }, i * 95); }); },
        hint: function () { tone(760, 0.1, 'sine', 0.04); setTimeout(function () { tone(600, 0.14, 'sine', 0.04); }, 110); },
        tick: function () { tone(1200, 0.03, 'square', 0.015); }
    };

    /* ----------------------------------------------------------------- dom */
    function h(tag, props, kids) {
        const el = document.createElement(tag);
        if (props) {
            Object.keys(props).forEach(function (k) {
                const v = props[k];
                if (v === null || v === undefined || v === false) return;
                if (k === 'class') el.className = v;
                else if (k === 'style') el.setAttribute('style', v);
                else if (k === 'html') el.innerHTML = v;
                else if (k === 'text') el.textContent = v;
                else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
                else el.setAttribute(k, v === true ? '' : v);
            });
        }
        (Array.isArray(kids) ? kids : kids === undefined || kids === null ? [] : [kids])
            .forEach(function (c) { if (c !== null && c !== undefined && c !== false) el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c))); });
        return el;
    }

    function reducedMotion() {
        return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    /* --------------------------------------------------------- floating ui */
    let toastEl = null, toastTimer = null;
    function toast(msg, ms) {
        if (!toastEl || !toastEl.isConnected) {
            toastEl = h('div', { class: 'ml-toast', role: 'status', 'aria-live': 'polite' });
            document.body.appendChild(toastEl);
        }
        toastEl.textContent = msg;
        toastEl.classList.add('is-on');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { toastEl.classList.remove('is-on'); }, ms || 2600);
    }

    let sheetHost = null;
    function sheet(content, opts) {
        opts = opts || {};
        closeSheet();
        const card = h('div', { class: 'ml-sheet-card' + (opts.wide ? ' is-wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.label || 'Dialog' });
        if (opts.title) card.appendChild(h('h3', { class: 'ml-sheet-title', text: opts.title }));
        /* The buttons leave the scrolling area and sit on the card itself, so a
           short screen scrolls the words and never the way out of the dialog. */
        const bars = [].slice.call(content.querySelectorAll('.ml-sheet-actions'));
        card.appendChild(h('div', { class: 'ml-sheet-scroll' }, content));
        bars.forEach(function (b) { card.appendChild(b); });
        /* The sheet lives on <body>, so it cannot inherit the running game's
           accent. Lend it one, or every dialog falls back to the house cyan. */
        const running = document.querySelector('.ml-game');
        const accent = running && running.style.getPropertyValue('--acc');
        if (accent) card.style.setProperty('--acc', accent);
        const back = h('div', { class: 'ml-sheet' }, card);
        back.addEventListener('click', function (e) { if (e.target === back && !opts.sticky) closeSheet(); });
        document.body.appendChild(back);
        document.body.classList.add('ml-sheet-open');
        requestAnimationFrame(function () { back.classList.add('is-on'); });
        sheetHost = back;
        const first = card.querySelector('button, input, select, textarea');
        if (first) setTimeout(function () { try { first.focus(); } catch (e) {} }, 60);
        return { back: back, card: card, close: closeSheet };
    }

    function closeSheet() {
        if (!sheetHost) return;
        const el = sheetHost;
        sheetHost = null;
        el.classList.remove('is-on');
        document.body.classList.remove('ml-sheet-open');
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, reducedMotion() ? 0 : 220);
    }

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && sheetHost) { e.stopPropagation(); closeSheet(); }
    }, true);

    function confirmDialog(opts) {
        return new Promise(function (resolve) {
            const done = function (v) { closeSheet(); resolve(v); };
            const row = h('div', { class: 'ml-sheet-actions' }, [
                h('button', { class: 'ml-btn', type: 'button', onclick: function () { done(false); }, text: opts.cancel || 'Keep playing' }),
                h('button', { class: 'ml-btn ml-btn-hot', type: 'button', onclick: function () { done(true); }, text: opts.ok || 'Yes' })
            ]);
            const s = sheet(h('div', {}, [h('p', { class: 'ml-sheet-body', text: opts.body || '' }), row]), { title: opts.title || 'Are you sure?', sticky: true, label: opts.title || 'Confirmation' });
            s.back.addEventListener('click', function (e) { if (e.target === s.back) done(false); });
        });
    }

    /* -------------------------------------------------------------- timers */
    function fmtTime(ms) {
        const t = Math.max(0, Math.floor(ms / 1000));
        const m = Math.floor(t / 60);
        return (m < 10 ? '0' : '') + m + ':' + ((t % 60) < 10 ? '0' : '') + (t % 60);
    }

    function Clock() {
        let started = Date.now(), paused = 0, base = 0, timer = null, onstep = null;
        const api = {
            elapsed: function () { return base + (paused ? 0 : Date.now() - started); },
            reset: function () { base = 0; started = Date.now(); },
            pause: function () { if (!paused) { base += Date.now() - started; paused = 1; } },
            resume: function () { if (paused) { paused = 0; started = Date.now(); } },
            stopped: function () { return !!paused; },
            start: function (fn) { onstep = fn; api.stop(); timer = setInterval(function () { if (onstep) onstep(api.elapsed()); }, 250); },
            stop: function () { if (timer) { clearInterval(timer); timer = null; } }
        };
        return api;
    }

    /* ------------------------------------------------------ module loading */
    const loaded = {};
    function requireFile(file) {
        if (loaded[file]) return loaded[file];
        loaded[file] = new Promise(function (resolve, reject) {
            const s = document.createElement('script');
            s.src = file;
            s.onload = function () { resolve(true); };
            s.onerror = function () { loaded[file] = null; reject(new Error('could not load ' + file)); };
            document.head.appendChild(s);
        });
        return loaded[file];
    }

    const registry = {};
    function register(id, impl) { registry[id] = impl; }

    /* =========================================================================
       THE GAME SHELL — one frame every game is played inside, so Back to
       Arcade, the timer, the score, hints and player turns behave the same
       in all three.
       ========================================================================= */
    function launch(meta, opts, host, onExit) {
        const mode = opts.mode || 'solo';
        const difficulty = opts.difficulty || 'Medium';
        const twoPlayer = mode !== 'solo';
        const players = twoPlayer
            ? [{ i: 0, name: 'Player 1', score: 0, solved: 0, wrong: 0, hints: 0 },
               { i: 1, name: 'Player 2', score: 0, solved: 0, wrong: 0, hints: 0 }]
            : [{ i: 0, name: 'You', score: 0, solved: 0, wrong: 0, hints: 0 }];

        const clock = Clock();
        let turn = 0, hintsLeft = SCORING.hintsPerRun, levelIndex = 0, levelLabel = '', levelTotal = meta.levels;
        let levelMoves = 0, levelWrong = 0, levelHints = 0, levelLocked = false, resetFn = null, ended = false;
        let parMs = 90000, parMoves = 4;
        const runHints = [];

        const root = h('div', { class: 'ml-game', style: '--acc:' + meta.accent });

        /* header */
        const backBtn = h('button', {
            class: 'ml-back', type: 'button', 'aria-label': 'Back to arcade',
            html: '<i class="fas fa-arrow-left" aria-hidden="true"></i><span>Back to Arcade</span>',
            onclick: function () { leave(); }
        });
        const soundBtn = h('button', { class: 'ml-icon-btn', type: 'button', 'aria-label': 'Sound on or off', onclick: toggleSound });
        const rulesBtn = h('button', { class: 'ml-icon-btn', type: 'button', 'aria-label': 'How to play', html: '<i class="fas fa-circle-question" aria-hidden="true"></i>', onclick: function () { api.showBrief(false); } });
        const pauseBtn = h('button', { class: 'ml-icon-btn', type: 'button', 'aria-label': 'Pause', html: '<i class="fas fa-pause" aria-hidden="true"></i>', onclick: togglePause });
        if (mode !== 'solo') pauseBtn.classList.add('is-off');
        const head = h('header', { class: 'ml-head' }, [
            backBtn,
            h('div', { class: 'ml-head-title', text: meta.title }),
            h('div', { class: 'ml-head-tools' }, [rulesBtn, pauseBtn, soundBtn])
        ]);

        /* hud */
        const chip = function (label, value, cls) {
            const v = h('b', { text: value });
            return { el: h('div', { class: 'ml-chip ' + (cls || '') }, [v, h('span', { text: label })]), value: v };
        };
        const cLevel = chip('Level', '1');
        const cTime = chip('Time', '00:00', 'ml-chip-time');
        const cMoves = chip('Moves', '0');
        const cHints = chip('Hints', String(hintsLeft));
        const cScore = chip('Score', '0', 'ml-chip-score');
        const cTurn = chip('Now', players[0].name, 'ml-chip-turn');
        cTurn.el.hidden = !twoPlayer;
        const hud = h('div', { class: 'ml-hud' }, [cLevel.el, cTime.el, cMoves.el, cHints.el, cScore.el, cTurn.el]);

        /* stage + status + actions */
        const stage = h('div', { class: 'ml-stage' });
        const say = h('p', { class: 'ml-say', role: 'status', 'aria-live': 'polite' });
        const hintBox = h('div', { class: 'ml-hintbox', hidden: true, role: 'note' });
        const hintBtn = h('button', {
            class: 'ml-btn ml-btn-hint', type: 'button',
            html: '<i class="fas fa-lightbulb" aria-hidden="true"></i> Hint',
            onclick: spendHint
        });
        const resetBtn = h('button', {
            class: 'ml-btn', type: 'button',
            html: '<i class="fas fa-rotate-left" aria-hidden="true"></i> Restart',
            onclick: restartLevel
        });
        const actions = h('div', { class: 'ml-actions' }, [hintBtn, resetBtn]);
        root.appendChild(head); root.appendChild(hud); root.appendChild(stage); root.appendChild(say); root.appendChild(hintBox); root.appendChild(actions);
        host.innerHTML = '';
        host.appendChild(root);
        document.body.classList.add('ml-playing');
        paintSound();

        const api = {
            host: stage, mode: mode, difficulty: difficulty, players: players,
            get turn() { return turn; },
            get moves() { return levelMoves; },
            get hintsLeft() { return hintsLeft; },
            get level() { return levelIndex; },
            get locked() { return levelLocked; },
            h: h, esc: esc, sfx: sfx, reduced: reducedMotion,
            current: function () { return players[turn]; },
            nextTurn: function () { turn = (turn + 1) % players.length; paintTurn(); return players[turn]; },
            setLevel: function (i, label, total) {
                levelIndex = i; levelLabel = label || ('Level ' + (i + 1));
                levelTotal = total || levelTotal;
                levelMoves = 0; levelWrong = 0; levelHints = 0; levelLocked = false;
                parMs = 90000; parMoves = 4;
                clock.reset();
                hintBox.hidden = true; hintBox.innerHTML = '';
                say.textContent = '';
                cLevel.value.textContent = (i + 1) + '/' + levelTotal;
                cMoves.value.textContent = '0';
                cLevel.el.firstChild.setAttribute('data-k', '');
                cLevel.el.lastChild.textContent = levelLabel;
                paintScore(); paintHints(); paintTurn();
            },
            setPar: function (ms, moves) { parMs = Math.max(1000, num(ms, 90000)); parMoves = Math.max(1, num(moves, 4)); },
            bumpMoves: function (k) { levelMoves += (k || 1); cMoves.value.textContent = String(levelMoves); sfx.move(); },
            say: function (t) { say.textContent = t || ''; },
            explain: function (t) { api._explain = t; },
            onReset: function (fn) { resetFn = fn; },
            hint: spendHint,
            setHint: function (v) {
                if (typeof v === 'function') { api._hintFn = v; api._hintText = null; }
                else { api._hintText = v; api._hintFn = null; }
            },
            failed: function (msg) {
                if (levelLocked) return;
                levelWrong++; api.current().wrong++;
                sfx.bad();
                say.textContent = msg || 'Not it.';
                root.classList.add('is-shake');
                setTimeout(function () { root.classList.remove('is-shake'); }, reducedMotion() ? 0 : 320);
                paintScore();
            },
            solved: function (info) {
                if (levelLocked) return 0;
                levelLocked = true;
                info = info || {};
                const who = api.current();
                const r = scoreSolve({
                    difficulty: difficulty,
                    timeMs: num(info.timeMs, clock.elapsed()),
                    parMs: num(info.parMs, parMs),
                    moves: num(info.moves, Math.max(1, levelMoves)),
                    par: num(info.par, parMoves),
                    hints: levelHints, wrong: levelWrong
                });
                who.score += r.points; who.solved += 1;
                if (mode === 'coop') { players[1 - turn].score += Math.round(r.points / 2); }
                clock.stop();
                sfx.unlock();
                setTimeout(function () { sfx.win(); }, 260);
                paintScore();
                const totalSolved = players.reduce(function (a, p) { return a + p.solved; }, 0);
                mutate(function (d) {
                    const g = d.games[meta.id];
                    g.solved += 1;
                    g.unlocked = Math.max(g.unlocked, Math.min(meta.levels, levelIndex + 1));
                });
                const fresh = grantBadges(badgeCandidates(meta.id, levelIndex + 1, totalSolved, r.fast));
                if (fresh.length) setTimeout(function () { toast('Badge unlocked · ' + BADGES[fresh[0]].name, 3400); }, 1400);
                showVictory(r, info);
                return r.points;
            },
            skip: function () {
                if (levelLocked) return;
                levelLocked = true;
                const who = api.current();
                who.score = Math.max(0, who.score - SCORING.skipCost);
                say.textContent = 'Skipped. ' + SCORING.skipCost + ' points off.';
                paintScore();
                clock.stop();
                advance();
            },
            finish: function () { endRun(); }
        };

        /* ----------------------------------------------------------- hints */
        function spendHint() {
            if (levelLocked) return;
            if (hintsLeft <= 0) { sfx.bad(); say.textContent = 'No hints left this run.'; return; }
            if (!api._hintFn && !api._hintText) { sfx.bad(); say.textContent = 'No hint for this one. Look again.'; return; }
            hintsLeft--; levelHints++; api.current().hints++;
            sfx.hint();
            const text = typeof api._hintFn === 'function' ? api._hintFn() : api._hintText;
            hintBox.hidden = false;
            hintBox.innerHTML = '<i class="fas fa-lightbulb" aria-hidden="true"></i> ' + esc(text) +
                '<em>−' + SCORING.hintCost + ' points</em>';
            paintHints(); paintScore();
        }

        /* --------------------------------------------------------- victory */
        function showVictory(r, info) {
            const lines = [];
            lines.push(h('p', { class: 'ml-win-lead', text: levelLabel + ' solved.' }));
            lines.push(h('div', { class: 'ml-win-score' }, [
                h('b', { text: '+' + r.points }),
                h('span', { text: r.cost ? 'bonuses ' + (r.speed + r.neat) + ', penalties −' + r.cost : 'no penalties' })
            ]));
            lines.push(h('ul', { class: 'ml-win-facts' }, [
                h('li', { text: 'Time ' + fmtTime(num(info.timeMs, clock.elapsed())) }),
                h('li', { text: 'Moves ' + num(info.moves, levelMoves) + ' (par ' + parMoves + ')' }),
                h('li', { text: 'Hints ' + levelHints }),
                h('li', { text: 'Wrong ' + levelWrong })
            ]));
            if (api._explain) lines.push(h('p', { class: 'ml-win-explain', html: '<b>What was going on.</b> ' + esc(api._explain) }));

            const kids = [];
            if (twoPlayer && mode === 'versus') {
                const other = players[1 - turn];
                kids.push(h('p', { class: 'ml-win-pass', text: 'Pass the device to ' + other.name + '.' }));
            }
            const isLast = levelIndex + 1 >= levelTotal;
            kids.push(h('div', { class: 'ml-sheet-actions' }, [
                h('button', { class: 'ml-btn', type: 'button', text: 'Restart level', onclick: function () { closeSheet(); restartLevel(); } }),
                isLast
                    ? h('button', { class: 'ml-btn ml-btn-hot', type: 'button', text: 'See the scoreboard', onclick: function () { closeSheet(); endRun(); } })
                    : h('button', { class: 'ml-btn ml-btn-hot', type: 'button', text: 'Next level', onclick: function () { closeSheet(); advance(); } })
            ]));
            sheet(h('div', {}, lines.concat(kids)), { title: 'Unlocked', wide: true, sticky: true, label: 'Level complete' });
        }

        function advance() {
            api._explain = null; api._hintText = null; api._hintFn = null;
            if (levelIndex + 1 >= levelTotal) { endRun(); return; }
            if (twoPlayer && mode === 'versus') api.nextTurn();
            if (registry[meta.id] && registry[meta.id].next) registry[meta.id].next(api);
            else if (resetFn) resetFn(levelIndex + 1);
        }

        function restartLevel() {
            api._explain = null;
            clock.reset(); clock.start(tick);
            levelLocked = false; levelMoves = 0;
            cMoves.value.textContent = '0';
            hintBox.hidden = true;
            if (resetFn) resetFn(levelIndex);
        }

        /* ----------------------------------------------------------- clock */
        function tick(ms) { cTime.value.textContent = fmtTime(ms); }
        clock.start(tick);

        function togglePause() {
            if (clock.stopped()) { clock.resume(); clock.start(tick); pauseBtn.innerHTML = '<i class="fas fa-pause" aria-hidden="true"></i>'; pauseBtn.setAttribute('aria-label', 'Pause'); root.classList.remove('is-paused'); }
            else { clock.pause(); clock.stop(); pauseBtn.innerHTML = '<i class="fas fa-play" aria-hidden="true"></i>'; pauseBtn.setAttribute('aria-label', 'Resume'); root.classList.add('is-paused'); }
            sfx.click();
        }

        function paintScore() {
            const total = players.reduce(function (a, p) { return a + p.score; }, 0);
            cScore.value.textContent = String(total);
        }
        function paintHints() {
            cHints.value.textContent = String(hintsLeft);
            hintBtn.disabled = hintsLeft <= 0;
        }
        function paintTurn() { cTurn.value.textContent = api.current().name; }
        function toggleSound() {
            const on = !load().settings.sound;
            mutate(function (d) { d.settings.sound = on; });
            paintSound();
            if (on) sfx.click();
        }
        function paintSound() {
            const on = load().settings.sound;
            soundBtn.innerHTML = '<i class="fas ' + (on ? 'fa-volume-high' : 'fa-volume-xmark') + '" aria-hidden="true"></i>';
            soundBtn.setAttribute('aria-label', on ? 'Mute sound effects' : 'Unmute sound effects');
            soundBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
        }

        /* ------------------------------------------------------------ exit */
        function endRun() {
            if (ended) return;
            ended = true;
            clock.stop();
            const total = players.reduce(function (a, p) { return a + p.solved; }, 0);
            const score = players.reduce(function (a, p) { return a + p.score; }, 0);
            const key = mode + '·' + difficulty;
            mutate(function (d) {
                const g = d.games[meta.id];
                g.plays += 1;
                if (!(g.best[key] >= score)) g.best[key] = score;
                g.lastPlays = (g.lastPlays || []).concat([{ score: score, mode: mode, difficulty: difficulty, at: Date.now() }]).slice(-8);
            });
            const fresh = grantBadges(runBadgeCandidates(total, mode));
            if (fresh.length) toast('Badge unlocked · ' + BADGES[fresh[0]].name, 3400);
            showScoreboard(score, total);
        }

        function runBadgeCandidates(solvedCount, m) {
            const ids = [];
            if (m !== 'solo') ids.push('shared-brain');
            if (players.every(function (p) { return p.hints === 0; }) && solvedCount > 0) ids.push('perfect-run');
            if (meta.id === 'grid' && solvedCount > 0 && (difficulty === 'Hard' || difficulty === 'Expert')) ids.push('logic-master');
            if (meta.id === 'glitch') {
                const g = load().games.glitch;
                if (g.solved >= BY_ID.glitch.levels) ids.push('reality-bender');
            }
            if (meta.id === 'box') {
                const g = load().games.box;
                if (g.unlocked >= BY_ID.box.levels) ids.push('box-opener');
            }
            return ids;
        }

        function badgeCandidates(gameId, levelNo, totalSolved, fast) {
            const ids = ['first-breakthrough'];
            if (fast) ids.push('quick-hand');
            if (gameId === 'grid') { const g = load().games.grid; if (g.solved >= 10) ids.push('pattern-hunter'); }
            if (gameId === 'glitch') { const g = load().games.glitch; if (g.solved >= 10) ids.push('reality-bender'); }
            if (gameId === 'box') { const g = load().games.box; if (g.unlocked >= BY_ID.box.levels) ids.push('box-opener'); }
            return ids;
        }

        function showScoreboard(score, solvedCount) {
            const rows = players.map(function (p) {
                return h('div', { class: 'ml-board-row' }, [
                    h('span', { class: 'ml-board-name', text: p.name }),
                    h('b', { text: String(p.score) }),
                    h('span', { text: p.solved + ' solved · ' + p.wrong + ' wrong · ' + p.hints + ' hints' })
                ]);
            });
            const best = load().games[meta.id].best[mode + '·' + difficulty] || 0;
            const impl = registry[meta.id];
            let extra = [];
            if (impl && typeof impl.review === 'function') {
                try { extra = (impl.review(api) || []).filter(Boolean); } catch (e) { extra = []; }
            }
            const kids = [
                h('p', { class: 'ml-win-lead', text: mode === 'solo' ? 'Run complete.' : (mode === 'coop' ? 'You two got there together.' : players.slice().sort(function (a, b) { return b.score - a.score; })[0].name + ' takes it.') }),
                h('div', { class: 'ml-win-score' }, [h('b', { text: String(score) }), h('span', { text: 'personal best ' + best })]),
                h('div', { class: 'ml-board' }, rows),
                h('p', { class: 'ml-fine', text: 'Both players share this device, so scores are kept on it too.' })
            ].concat(extra).concat([
                h('div', { class: 'ml-sheet-actions' }, [
                    h('button', { class: 'ml-btn', type: 'button', text: 'Back to Arcade', onclick: function () { closeSheet(); leave(true); } }),
                    h('button', { class: 'ml-btn ml-btn-hot', type: 'button', text: 'Rematch', onclick: function () { closeSheet(); rematch(); } })
                ])
            ]);
            sheet(h('div', {}, kids), { title: 'Scoreboard', wide: true, sticky: true, label: 'Run results' });
        }

        function rematch() {
            players.forEach(function (p) { p.score = 0; p.solved = 0; p.wrong = 0; p.hints = 0; });
            turn = 0; hintsLeft = SCORING.hintsPerRun; ended = false; levelLocked = false;
            clock.reset(); clock.start(tick);
            paintScore(); paintHints(); paintTurn();
            if (registry[meta.id] && registry[meta.id].start) registry[meta.id].start(api);
        }

        function leave(force) {
            if (!force && !ended) {
                confirmDialog({ title: 'Leave the game?', body: 'This run has not been scored yet. Leaving now drops it.', ok: 'Leave', cancel: 'Stay' })
                    .then(function (v) { if (v) leave(true); });
                return;
            }
            closeSheet();
            clock.stop();
            document.body.classList.remove('ml-playing');
            host.innerHTML = '';
            if (onExit) onExit();
        }

        /* The site has its own tab bar and its own swipe gestures, so a player can
           walk out of the arcade mid-run without pressing Back to Arcade. Coming
           back has to land on the same level with the same clock, therefore the
           run freezes rather than dies, and any open sheet steps out of the way. */
        let away = false, pausedBefore = false;

        api.suspend = function () {
            if (away || ended) return;
            away = true;
            pausedBefore = root.classList.contains('is-paused');
            clock.pause(); clock.stop();
            document.body.classList.remove('ml-playing');
            if (sheetHost) {
                sheetHost.style.display = 'none';
                document.body.classList.remove('ml-sheet-open');
            }
        };

        api.resume = function () {
            if (!away || ended) return;
            away = false;
            document.body.classList.add('ml-playing');
            if (sheetHost) {
                sheetHost.style.display = '';
                document.body.classList.add('ml-sheet-open');
            }
            if (!pausedBefore) { clock.resume(); clock.start(tick); }
        };

        /* Rules go up before the first level, then stay one tap away. The clock
           waits for the player to finish reading — nobody is scored while a
           sheet is covering the board. */
        api.showBrief = function (first) {
            const owner = registry[meta.id];
            if (!owner || typeof owner.rules !== 'function') return;
            const wasPaused = clock.stopped();
            if (!wasPaused) { clock.pause(); clock.stop(); }
            const body = h('div', { class: 'ml-sheet-body' });
            let lines = [];
            try { lines = owner.rules(api) || []; } catch (e) { lines = []; }
            if (!Array.isArray(lines)) lines = [String(lines)];
            lines.forEach(function (line) { body.appendChild(h('p', { class: 'ml-fine ml-rule', text: line })); });
            if (mode !== 'solo') {
                body.appendChild(h('p', {
                    class: 'ml-note',
                    html: '<i class="fas fa-mobile-screen-button" aria-hidden="true"></i> ' + esc(mode === 'coop'
                        ? 'Co-op on one device: you both work the same puzzle and hand the hints around. Whoever cracks it takes the points.'
                        : 'Versus on one device: you take turns, same level for both of you, and the device passes at the end of each round.')
                }));
            }
            const actions = h('div', { class: 'ml-sheet-actions' });
            actions.appendChild(h('button', {
                class: 'ml-btn ml-btn-hot', type: 'button', text: first ? 'Start' : 'Back to the game',
                onclick: function () {
                    closeSheet();
                    mutate(function (d) { d.seen[meta.id] = 1; });
                    if (!wasPaused) { clock.resume(); clock.start(tick); }
                }
            }));
            body.appendChild(actions);
            sheet(body, { title: 'How ' + meta.title + ' works', sticky: true, wide: true });
            sfx.click();
        };

        return api;
    }

    /* =========================================================================
       THE ARCADE FLOOR
       ========================================================================= */
    let rootEl = null, picks = {};

    function pickOf(id) {
        const meta = BY_ID[id];
        if (!picks[id]) picks[id] = { difficulty: meta.difficulties[Math.min(1, meta.difficulties.length - 1)], mode: 'solo' };
        return picks[id];
    }

    function difficultyChips(meta, sel, onPick) {
        return h('div', { class: 'ml-seg', role: 'group', 'aria-label': 'Difficulty' }, meta.difficulties.map(function (d) {
            return h('button', {
                class: 'ml-seg-btn' + (d === sel ? ' is-on' : ''), type: 'button', text: d,
                'aria-pressed': d === sel ? 'true' : 'false',
                onclick: function () { onPick(d); }
            });
        }));
    }

    const MODE_COPY = {
        solo: { label: 'Solo', note: 'One player, your own best to beat.' },
        coop: { label: 'Two-player co-op', note: 'Both of you on the same device, one shared puzzle, points split.' },
        versus: { label: 'Two-player versus', note: 'Both of you on the same device, passing it back and forth.' }
    };

    function modeChips(meta, sel, onPick) {
        return h('div', { class: 'ml-seg ml-seg-modes', role: 'group', 'aria-label': 'Mode' }, meta.modes.map(function (m) {
            return h('button', {
                class: 'ml-seg-btn' + (m === sel ? ' is-on' : ''), type: 'button', text: MODE_COPY[m].label,
                title: MODE_COPY[m].note, 'aria-pressed': m === sel ? 'true' : 'false',
                onclick: function () { onPick(m); }
            });
        }));
    }

    function bestLine(meta) {
        const g = load().games[meta.id];
        const keys = Object.keys(g.best);
        if (!keys.length) return 'No score yet on this device.';
        let top = keys[0];
        keys.forEach(function (k) { if (g.best[k] > g.best[top]) top = k; });
        return 'Local best ' + g.best[top] + ' · ' + top.replace('·', ' ') + ' · ' + g.solved + ' solved';
    }

    function difficultyMeter(meta) {
        const n = meta.difficulties.length;
        return h('div', { class: 'ml-diff', 'aria-label': n + ' difficulty levels' },
            [1, 2, 3, 4].slice(0, Math.max(3, n)).map(function (i) { return h('i', { class: i <= n ? 'is-on' : '' }); }));
    }

    function gameCard(meta) {
        const sel = pickOf(meta.id);
        const g = load().games[meta.id];
        const card = h('article', { class: 'ml-card', style: '--acc:' + meta.accent });
        card.innerHTML =
            '<div class="ml-card-top"><span class="ml-card-icon"><i class="fas ' + meta.icon + '" aria-hidden="true"></i></span>' +
            '<div><h3>' + esc(meta.title) + '</h3><p class="ml-card-tag">' + esc(meta.tagline) + '</p></div></div>' +
            '<p class="ml-card-blurb">' + esc(meta.blurb) + '</p>';
        const body = h('div', { class: 'ml-card-body' }, [
            h('div', { class: 'ml-card-row' }, [h('span', { text: 'Difficulty' }), difficultyMeter(meta)]),
            difficultyChips(meta, sel.difficulty, function (d) { sel.difficulty = d; repaint(card, meta); }),
            h('div', { class: 'ml-card-row' }, [h('span', { text: 'Players' })]),
            modeChips(meta, sel.mode, function (m) { sel.mode = m; repaint(card, meta); }),
            h('p', { class: 'ml-mode-note', text: MODE_COPY[sel.mode].note }),
            h('p', { class: 'ml-best', text: bestLine(meta) }),
            h('p', { class: 'ml-progress', text: g.unlocked > 0 ? meta.levels + ' levels · ' + Math.min(g.unlocked, meta.levels) + ' reached' : meta.levels + ' levels' })
        ]);
        const play = h('button', {
            class: 'ml-btn ml-btn-play', type: 'button',
            html: '<i class="fas fa-play" aria-hidden="true"></i> Play',
            onclick: function () { openGame(meta.id, sel.difficulty, sel.mode); }
        });
        card.appendChild(body);
        card.appendChild(play);
        card._meta = meta;
        return card;
    }

    function repaint(card, meta) {
        const sel = pickOf(meta.id);
        const diffs = card.querySelector('.ml-seg');
        if (diffs) { const fresh = difficultyChips(meta, sel.difficulty, function (d) { sel.difficulty = d; repaint(card, meta); }); diffs.replaceWith(fresh); }
        const modes = card.querySelector('.ml-seg-modes');
        if (modes) { const fresh = modeChips(meta, sel.mode, function (m) { sel.mode = m; repaint(card, meta); }); modes.replaceWith(fresh); }
        const note = card.querySelector('.ml-mode-note');
        if (note) note.textContent = MODE_COPY[sel.mode].note;
        const best = card.querySelector('.ml-best');
        if (best) best.textContent = bestLine(meta);
        const prog = card.querySelector('.ml-progress');
        if (prog) { const g = load().games[meta.id]; prog.textContent = g.unlocked > 0 ? meta.levels + ' levels · ' + Math.min(g.unlocked, meta.levels) + ' reached' : meta.levels + ' levels'; }
        sfx.click();
    }

    /* Sound belongs to the whole lab, so it is switchable from the landing floor
       as well as from inside a game. */
    function soundHomeBtn() {
        const btn = h('button', {
            class: 'ml-btn ml-btn-quiet', type: 'button',
            onclick: function () {
                const on = !load().settings.sound;
                mutate(function (d) { d.settings.sound = on; });
                paint();
                if (on) sfx.click();
            }
        });
        function paint() {
            const on = load().settings.sound;
            btn.innerHTML = '<i class="fas ' + (on ? 'fa-volume-high' : 'fa-volume-xmark') + '" aria-hidden="true"></i> ' + (on ? 'Sound effects on' : 'Sound effects off');
            btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        }
        paint();
        return btn;
    }

    function badgeStrip() {
        const d = load();
        return h('div', { class: 'ml-badges' }, Object.keys(BADGES).map(function (id) {
            const b = BADGES[id], got = !!d.badges[id];
            return h('div', {
                class: 'ml-badge' + (got ? ' is-got' : ''), title: got ? b.name + ': ' + b.note : 'Locked: ' + b.note,
                html: '<i class="fas ' + b.icon + '" aria-hidden="true"></i><span>' + esc(b.name) + '</span>'
            });
        }));
    }

    function renderHome() {
        if (!rootEl) return;
        const d = load();
        rootEl.innerHTML = '';
        const hero = h('header', { class: 'ml-hero' }, [
            h('p', { class: 'ml-kicker', text: 'Fred & Brilliant · The Mind Lab' }),
            h('h2', { class: 'ml-title', text: 'The Mind Lab' }),
            h('p', { class: 'ml-sub', text: 'Three games. One brain. Absolutely no mercy.' }),
            soundHomeBtn()
        ]);
        hero.appendChild(h('p', { class: 'ml-note', html: '<i class="fas fa-mobile-screen" aria-hidden="true"></i> Two-player modes share this device. There is no online play, no accounts, nothing leaves the browser.' }));
        if (!storageWorks()) hero.appendChild(h('p', { class: 'ml-note ml-note-warn', html: '<i class="fas fa-triangle-exclamation" aria-hidden="true"></i> This browser will not store anything, so scores last only until you close the tab. The games still work.' }));
        rootEl.appendChild(hero);

        const grid = h('div', { class: 'ml-grid' }, MANIFEST.map(gameCard));
        rootEl.appendChild(grid);

        rootEl.appendChild(h('section', { class: 'ml-floors' }, [
            h('h3', { class: 'ml-h3', text: 'Badges' }),
            badgeStrip(),
            h('p', { class: 'ml-fine', text: Object.keys(d.badges).length + ' of ' + Object.keys(BADGES).length + ' earned on this device.' })
        ]));

        const resetBtn = h('button', {
            class: 'ml-btn ml-btn-quiet', type: 'button',
            html: '<i class="fas fa-trash-can" aria-hidden="true"></i> Reset all progress',
            onclick: function () {
                confirmDialog({ title: 'Reset everything?', body: 'Scores, badges and unlocked levels on this device go back to zero. This cannot be undone.', ok: 'Reset it', cancel: 'Keep them' })
                    .then(function (v) { if (v) { resetProgress(); toast('Progress cleared'); renderHome(); } });
            }
        });
        rootEl.appendChild(h('section', { class: 'ml-floors' }, [
            h('h3', { class: 'ml-h3', text: 'How scoring works' }),
            h('p', { class: 'ml-fine', text: 'Solving a level is worth 100 points, multiplied by difficulty. Finishing inside par time and in par moves adds bonuses up to 80 more. Each hint costs 25, each wrong guess 5, a skip 20. Scores never go below zero.' }),
            h('p', { class: 'ml-fine', text: 'Three hints per run. Progress, personal bests and badges live in this browser under one versioned key.' }),
            resetBtn
        ]));
    }

    /* ------------------------------------------------------------- opening */
    let current = null;

    function openGame(id, difficulty, mode) {
        const meta = BY_ID[id];
        if (!meta) return;
        rootEl.innerHTML = '';
        const host = h('div', { class: 'ml-frame' });
        const loading = h('p', { class: 'ml-loading', html: '<i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i> Loading ' + esc(meta.title) + '…' });
        host.appendChild(loading);
        rootEl.appendChild(host);

        requireFile(meta.file).then(function () {
            const impl = registry[id];
            if (!impl || typeof impl.start !== 'function') throw new Error('no game implementation');
            loading.remove();
            const api = launch(meta, { difficulty: difficulty, mode: mode }, host, function () { current = null; renderHome(); });
            current = { id: id, api: api };
            try {
                impl.start(api);
                // The rules come up before the first level, once per game per device.
                if (typeof impl.rules === 'function' && !load().seen[id]) setTimeout(function () { api.showBrief(true); }, 90);
            }
            catch (e) { host.appendChild(h('p', { class: 'ml-loading', text: 'That game failed to start: ' + e.message })); }
        }).catch(function (err) {
            loading.className = 'ml-loading ml-note-warn';
            loading.innerHTML = '<i class="fas fa-plug-circle-xmark" aria-hidden="true"></i> ' + esc(meta.title) +
                ' could not load (' + esc(err.message) + '). <button class="ml-btn ml-btn-quiet" type="button" id="mlRetry">Try again</button>' +
                ' <button class="ml-btn ml-btn-quiet" type="button" id="mlBack">Back to Arcade</button>';
            const r = document.getElementById('mlRetry'); if (r) r.onclick = function () { openGame(id, difficulty, mode); };
            const b = document.getElementById('mlBack'); if (b) b.onclick = function () { renderHome(); };
        });
    }

    function mount(el) {
        if (current) { current.api.resume(); return; }
        rootEl = el;
        if (!el.querySelector('[data-ml-ready]')) {
            el.innerHTML = '<div data-ml-ready></div>';
            rootEl = el.firstChild;
            el.className = (el.className || '') + ' ml-root';
        }
        renderHome();
    }

    function suspendRun() { if (current && current.api) current.api.suspend(); }
    function resumeRun() { if (current && current.api) current.api.resume(); }

    window.MindLab = {
        version: 1, KEY: KEY, MANIFEST: MANIFEST, BADGES: BADGES, SCORING: SCORING, DIFFS: DIFFS,
        register: register, mount: mount, home: renderHome, open: openGame,
        registry: registry,
        suspend: suspendRun, resume: resumeRun,
        store: { load: load, mutate: mutate, reset: resetProgress, works: storageWorks, reload: reload },
        score: scoreSolve, fmtTime: fmtTime, sfx: sfx, h: h, esc: esc, toast: toast,
        sheet: sheet, closeSheet: closeSheet,
        confirm: confirmDialog, reduced: reducedMotion,
        api: function () { return current && current.api; }
    };
})();
