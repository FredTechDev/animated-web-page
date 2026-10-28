/* ==========================================================================
   THE IMPOSSIBLE BOX — twelve rooms, one mechanism each.
   Every room is a box: switches that only work in one order, engravings in the
   box's own alphabet, keypads, a dial, inlay tiles and a plate or two that lift
   although nothing says so. Nothing here is generated at play time and nothing
   asks the player to guess a blind answer: every room prints the rule that
   opens it, and where a room accepts more than one arrangement the rule that
   accepts it is printed on the box too.
   Browser only: no network, no dependencies, no build step, no modules.
   ========================================================================== */
(function () {
    'use strict';
    const M = window.MindLab;
    if (!M) return;

    /* The module's own sheet. arcade.css is shared between three games and is
       being edited elsewhere, so anything new this box needs lives here. */
    if (!document.querySelector('link[href="arcade/box.css"]')) {
        const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'arcade/box.css'; document.head.appendChild(l);
    }

    const h = M.h, esc = M.esc;

    /* -------------------------------------------------- the box's own alphabet */
    const KEYALL = [
        { m: '●', v: 1 }, { m: '○', v: 2 }, { m: '■', v: 3 }, { m: '□', v: 4 }, { m: '▲', v: 5 },
        { m: '▼', v: 6 }, { m: '◆', v: 7 }, { m: '◇', v: 8 }, { m: '★', v: 9 }
    ];
    const VAL = {};
    KEYALL.forEach(function (k) { VAL[k.m] = k.v; });
    const CORNERED = ['■', '□', '▲', '◆', '◇', '★'];
    const DASH = '·';

    /* -------------------------------------------------------------- run state */
    let api = null, solver = null, log = [];

    /* Guidance is the only thing difficulty changes about the room itself:
       3 = Easy    labelled, instructed, counters, one extra pointer
       2 = Medium  labelled, instructed, counters
       1 = Hard    panels named only, no reminders, no counters
       0 = Expert  no panel labels at all, no nudges, no counters
       The rule that opens a room is printed at every one of the four. */
    function G() {
        const d = api && api.difficulty;
        return d === 'Easy' ? 3 : d === 'Hard' ? 1 : d === 'Expert' ? 0 : 2;
    }

    const MULT = { Easy: 1.5, Medium: 1.2, Hard: 1, Expert: 0.8 };
    function parFor(L) {
        const d = api.difficulty;
        const extra = d === 'Easy' ? 2 : d === 'Medium' ? 1 : 0;
        return { ms: Math.round(L.t * 1000 * (MULT[d] || 1.2)), moves: L.m + extra };
    }

    /* the room gives once: a short glow, a sound, and the shell takes over */
    function win() {
        if (api.locked) return;
        const r = log[api.level];
        if (r) { r.out = 'right'; r.moves = api.moves; }
        const room = api.host.querySelector('.mb-room');
        if (room && !api.reduced()) {
            room.classList.add('mb-crack');
            setTimeout(function () { room.classList.remove('mb-crack'); }, 520);
        }
        api.sfx.good();
        api.solved({});
    }

    /* position at which a typed code first stops matching */
    function firstDiff(got, code) {
        for (let i = 0; i < code.length; i++) if (got[i] !== code[i]) return i;
        return 0;
    }
    /* where the player is told which digit went wrong — Easy only */
    function codeMiss(got, code, kp) {
        api.failed(G() === 3 ? 'The bolt stops at digit ' + (firstDiff(got, code) + 1) + '.' : 'The bolt does not turn.');
        kp.reset();
    }

    /* ---------------------------------------------------------------- widgets */
    function panel(label, kids, cls) {
        const p = h('div', { class: 'ml-panelbox' + (cls ? ' ' + cls : '') });
        const g = G();
        if (g >= 1 && label) p.appendChild(h('h4', { text: g === 1 ? label.s : label.f }));
        (kids || []).forEach(function (k) { if (k) p.appendChild(k); });
        return p;
    }
    /* the line that states how this room works — on screen at every difficulty */
    function rule(text) { return h('p', { class: 'ml-p', text: text }); }
    /* how a widget is physically operated — Easy and Medium */
    function note(text) { return G() >= 2 ? h('p', { class: 'ml-clue', text: text }) : null; }
    /* "that plate looks loose" — Easy and Medium */
    function nudge(text) {
        return G() >= 2 ? h('p', { class: 'ml-clue mb-nudge', html: '<i class="fas fa-hand-pointer" aria-hidden="true"></i> ' + esc(text) }) : null;
    }
    /* one extra pointer — Easy only */
    function easy(text) { return G() === 3 ? h('p', { class: 'ml-clue mb-easy', text: text }) : null; }
    /* a running counter — Easy and Medium, removed at Hard and Expert */
    function counter(text) {
        const el = h('p', { class: 'ml-count mb-counter', 'aria-live': 'polite', text: text == null ? '' : text });
        const show = G() >= 2;
        if (!show) el.hidden = true;
        el.set = function (t) { if (show) el.textContent = t; };
        return el;
    }
    function row(kids, cls) {
        const r = h('div', { class: 'mb-foot' + (cls ? ' ' + cls : '') });
        (kids || []).forEach(function (k) { if (k) r.appendChild(k); });
        return r;
    }
    function btn(label, cls, onclick, aria) {
        return h('button', { class: 'ml-btn ' + (cls || ''), type: 'button', text: label, onclick: onclick, 'aria-label': aria || label });
    }

    /* a row of engraved marks: a message, not a control */
    function marks(list, cls, label) {
        const wrap = h('div', { class: 'mb-marks' + (cls ? ' ' + cls : ''), role: 'note', 'aria-label': label || 'Engraved marks' });
        (Array.isArray(list) ? list : [list]).forEach(function (t) {
            wrap.appendChild(h('span', { class: 'mb-mark', text: t }));
        });
        return wrap;
    }
    /* the engraved key that gives marks their values */
    function keyList(pairs, cls) {
        const wrap = h('div', { class: 'mb-keys' + (cls ? ' ' + cls : '') });
        pairs.forEach(function (p) { wrap.appendChild(h('p', { class: 'mb-keyline', text: p.m + ' = ' + p.v })); });
        return wrap;
    }
    function keyFor(shown) {
        return KEYALL.filter(function (k) { return shown.indexOf(k.m) >= 0; });
    }

    /* switches that only work in one sequence */
    function seqSwitches(labels, opts) {
        const out = {}, byLabel = {};
        let at = 0;
        const rowEl = h('div', { class: 'ml-switches', role: 'group', 'aria-label': opts.aria || 'Switches' });
        labels.forEach(function (lb) {
            const b = h('button', {
                class: 'ml-switch mb-dots', type: 'button', 'aria-pressed': 'false',
                'aria-label': 'switch marked ' + lb, text: lb
            });
            b.onclick = function () {
                if (api.locked) return;
                api.bumpMoves(1);
                if (lb === opts.want[at]) {
                    b.setAttribute('aria-pressed', 'true');
                    api.sfx.click();
                    at++;
                    if (opts.onStep) opts.onStep(at);
                    if (at === opts.want.length) { api.sfx.unlock(); if (opts.onDone) opts.onDone(); }
                } else {
                    at = 0;
                    rowEl.querySelectorAll('.ml-switch').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
                    if (opts.onStep) opts.onStep(0);
                    api.failed(opts.bad || 'Out of order. The latch dropped back.');
                }
            };
            byLabel[lb] = b;
            rowEl.appendChild(b);
        });
        out.el = rowEl;
        out.press = function (lb) { if (byLabel[lb]) byLabel[lb].click(); };
        return out;
    }

    /* a keypad with a readout of its own */
    function keypad(opts) {
        const digits = opts.digits || 4, keys = {};
        const out = {};
        let buf = '';
        const ro = h('p', { class: 'ml-readout', 'aria-live': 'polite', 'aria-label': opts.aria || 'Code entered' });
        const grid = h('div', { class: 'ml-keypad', role: 'group', 'aria-label': opts.aria || 'Keypad' });
        function paint() { ro.textContent = buf + DASH.repeat(Math.max(0, digits - buf.length)); }
        function key(label, cls, aria, fn) {
            const b = h('button', { class: 'ml-key' + (cls ? ' ' + cls : ''), type: 'button', 'aria-label': aria, text: label });
            b.onclick = function () {
                if (api.locked) return;
                api.bumpMoves(1);
                fn();
                paint();
            };
            grid.appendChild(b);
            keys[label] = b;
        }
        '123456789'.split('').forEach(function (d) {
            key(d, '', 'press digit ' + d, function () {
                if (buf.length >= digits) { api.say('That bolt takes ' + digits + ' digits. CLR wipes it.'); return; }
                buf += d;
            });
        });
        key('CLR', 'mb-key-fn', 'clear the code', function () { buf = ''; });
        key('0', '', 'press digit 0', function () {
            if (buf.length >= digits) { api.say('That bolt takes ' + digits + ' digits. CLR wipes it.'); return; }
            buf += '0';
        });
        key('SET', 'mb-key-set', 'set the code', function () {
            if (buf.length !== digits) { api.say('The bolt wants ' + digits + ' digit' + (digits === 1 ? '' : 's') + ' first.'); return; }
            if (opts.onEnter) opts.onEnter(buf.slice());
        });
        paint();
        out.el = h('div', {}, [ro, grid]);
        out.press = function (v) { if (keys[String(v)]) keys[String(v)].click(); };
        out.reset = function () { buf = ''; paint(); };
        out.digits = digits;
        return out;
    }

    /* a dial you turn one notch at a time, with the marks printed round it */
    function dial(marksArr, opts) {
        const n = marksArr.length, out = {}, cell = [];
        let at = 0;
        const el = h('div', { class: 'mb-dialbox' });
        const stage = h('div', { class: 'mb-dialstage' });
        stage.appendChild(h('div', { class: 'mb-dialring', 'aria-hidden': 'true' }));
        marksArr.forEach(function (mk, i) {
            const m = h('span', { class: 'mb-dialmark', style: '--a:' + (i * 360 / n) + 'deg', text: mk, 'aria-hidden': 'true' });
            cell.push(m);
            stage.appendChild(m);
        });
        stage.appendChild(h('span', { class: 'mb-dialpin', 'aria-hidden': 'true' }));
        stage.appendChild(h('span', { class: 'mb-dialhere', 'aria-hidden': 'true' }));
        const knob = h('button', { class: 'ml-dial', type: 'button', 'aria-label': 'Turn the dial one notch' });
        stage.appendChild(knob);
        const here = counter('');
        el.appendChild(stage);
        el.appendChild(here);
        function paint() {
            knob.style.setProperty('--rot', (at * 360 / n) + 'deg');
            cell.forEach(function (c, i) { c.classList.toggle('is-there', i === at); });
            knob.setAttribute('aria-label', 'Turn the dial one notch, pointer on ' + marksArr[at]);
            here.set('pointer on ' + marksArr[at]);
        }
        knob.onclick = function () {
            if (api.locked) return;
            at = (at + 1) % n;
            api.bumpMoves(1);
            api.sfx.tick();
            paint();
            if (opts.onTurn) opts.onTurn(at, marksArr[at]);
        };
        paint();
        out.el = el;
        out.knob = knob;
        out.at = function () { return at; };
        out.turnTo = function (target) {
            let steps = (target - at + n) % n;
            while (steps-- > 0) knob.click();
        };
        return out;
    }

    /* a plate or panel that is really a catch — nobody says so */
    function thing(opts) {
        const out = {};
        let open = !!opts.startOpen;
        const el = h('button', {
            class: 'mb-thing' + (opts.cls ? ' ' + opts.cls : ''), type: 'button',
            'aria-expanded': open ? 'true' : 'false', 'aria-label': opts.aria || 'Loose plate, tap to lift it'
        });
        el.appendChild(h('i', { class: 'fas ' + opts.icon, 'aria-hidden': 'true' }));
        el.appendChild(h('span', { text: opts.label || '' }));
        const reveal = h('span', { class: 'mb-catch', hidden: true });
        el.appendChild(reveal);
        reveal.textContent = opts.reveal == null ? '' : opts.reveal;
        function paint() {
            el.classList.toggle('is-open', open);
            el.setAttribute('aria-expanded', open ? 'true' : 'false');
            reveal.hidden = !open || !reveal.textContent;
        }
        function show(text) { reveal.textContent = text == null ? '' : text; paint(); }
        function toggle() {
            if (api.locked) return;
            open = !open;
            api.bumpMoves(1);
            api.sfx[open ? 'unlock' : 'move']();
            paint();
            if (opts.onToggle) opts.onToggle(open);
        }
        paint();
        el.onclick = toggle;
        out.el = el;
        out.show = show;
        out.press = function () { el.click(); };
        out.open = function () { if (!open) el.click(); };
        out.isopen = function () { return open; };
        return out;
    }

    /* an engraved plate that swings between two readings */
    function flipPlate(opts) {
        const out = {};
        let front = !!opts.startFront;
        const el = h('button', {
            class: 'mb-flip' + (opts.cls ? ' ' + opts.cls : ''), type: 'button',
            'aria-expanded': front ? 'true' : 'false',
            'aria-label': opts.aria || 'Engraved plate, tap it to swing the plate round'
        });
        const f = h('span', { class: 'mb-flip-front' });
        const b = h('span', { class: 'mb-flip-back' });
        (opts.front || []).forEach(function (t) { f.appendChild(h('span', { class: 'mb-keyline', text: t })); });
        (opts.back || []).forEach(function (t) { b.appendChild(h('span', { class: 'mb-keyline', text: t })); });
        el.appendChild(f);
        el.appendChild(b);
        function paint() {
            el.classList.toggle('is-back', !front);
            el.classList.toggle('mb-flip-mirror', !front);
            el.setAttribute('aria-expanded', front ? 'true' : 'false');
            if (opts.onShow) opts.onShow(front);
        }
        paint();
        el.onclick = function () {
            if (api.locked) return;
            front = !front;
            api.bumpMoves(1);
            api.sfx.move();
            paint();
        };
        out.el = el;
        out.press = function () { el.click(); };
        out.showFront = function (v) { if (front !== v) { front = v; paint(); } };
        out.showing = function () { return front; };
        return out;
    }

    /* inlay tiles into a row of slots; tiles are addressed by index so a room
       can hand out two of the same mark */
    function arrange(opts) {
        const out = {}, slots = [], pool = [];
        const placed = [];
        const joints = opts.rails && G() >= 2 ? h('p', { class: 'mb-joints', 'aria-live': 'polite' }) : null;
        const slotRow = h('div', { class: 'ml-slots', role: 'group', 'aria-label': 'The row to fill' });
        const tileRow = h('div', { class: 'ml-tiles', role: 'group', 'aria-label': 'Tiles to place' });

        function labels() { return placed.map(function (i) { return pool[i].label; }); }
        function paintJoints() {
            if (!joints) return;
            joints.textContent = '';
            const list = labels();
            for (let i = 0; i <= list.length; i++) {
                const want = i === 0 ? opts.rails[0] : list[i - 1].slice(-1);
                const good = i === 0 || i === list.length;
                const got = i === list.length ? null : list[i].charAt(0);
                joints.appendChild(h('span', {
                    class: 'mb-joint' + (good ? ' is-good' : got === want ? ' is-good' : ' is-bad'),
                    text: i === 0 ? 'rail ' + want : i === list.length ? 'closes on ' + opts.rails[1] : want + ' / ' + got
                }));
            }
        }
        function paint() {
            slots.forEach(function (s, i) {
                const lb = pool[placed[i]];
                s.textContent = lb ? lb.label : DASH;
                s.classList.toggle('is-full', !!lb);
            });
            pool.forEach(function (t, i) {
                const used = placed.indexOf(i) >= 0;
                t.el.classList.toggle('is-placed', used);
                t.el.setAttribute('aria-pressed', used ? 'true' : 'false');
            });
            paintJoints();
            if (opts.onStep) opts.onStep(labels());
        }
        for (let i = 0; i < opts.slots; i++) {
            const s = h('button', { type: 'button', class: 'ml-slot', 'aria-label': 'position ' + (i + 1), text: DASH });
            s.onclick = function () {
                if (api.locked) return;
                const at = slots.indexOf(s);
                if (placed[at] === undefined) return;
                placed.splice(at, 1);
                api.bumpMoves(1);
                paint();
            };
            slots.push(s);
            slotRow.appendChild(s);
        }
        opts.tiles.forEach(function (label, n) {
            const b = h('button', { type: 'button', class: 'ml-tile', 'aria-pressed': 'false', text: label, 'aria-label': 'tile ' + label });
            const rec = { label: label, el: b, n: n };
            b.onclick = function () {
                if (api.locked || b.classList.contains('is-placed')) return;
                if (placed.length >= opts.slots) { api.say('Every slot is full. Tap a slot to take one back.'); return; }
                placed.push(pool.indexOf(rec));
                api.bumpMoves(1);
                api.sfx.click();
                paint();
                if (placed.length === opts.slots && opts.auto) commit();
            };
            pool.push(rec);
            tileRow.appendChild(b);
        });
        function commit() {
            if (api.locked) return;
            if (placed.length !== opts.slots) { api.say('Fill every slot before you set it.'); return; }
            if (!opts.auto) api.bumpMoves(1);
            if (opts.accept && opts.accept(labels())) win();
            else api.failed(opts.bad || 'That is not how it goes.');
        }
        const setBtn = opts.auto ? null : btn('SET THE ROW', 'ml-btn-hot', commit, 'set the row');
        out.el = h('div', {}, [slotRow, tileRow, joints, setBtn ? row([setBtn]) : null]);
        out.press = function (label) {
            const use = placed.slice();
            for (let i = 0; i < pool.length; i++) {
                if (pool[i].label !== label || use.indexOf(i) >= 0) continue;
                pool[i].el.click();
                return;
            }
        };
        out.commit = function () { if (setBtn) setBtn.click(); };
        out.labels = labels;
        paint();
        return out;
    }

    /* light-the-right-cells mosaic */
    function mosaic(grid, opts) {
        const out = {}, cells = [];
        const el = h('div', { class: 'ml-tilegrid', style: 'grid-template-columns: repeat(3, 44px)', role: 'group', 'aria-label': opts.aria || 'Mosaic cells' });
        grid.forEach(function (mk, i) {
            const b = h('button', {
                type: 'button', class: 'mb-cell', 'aria-pressed': 'false',
                'aria-label': 'cell ' + (i + 1) + ' marked ' + mk, text: mk
            });
            b.onclick = function () {
                if (api.locked) return;
                const on = b.getAttribute('aria-pressed') !== 'true';
                b.setAttribute('aria-pressed', on ? 'true' : 'false');
                api.bumpMoves(1);
                if (opts.onStep) opts.onStep(lit().length);
            };
            cells.push(b);
            el.appendChild(b);
        });
        function lit() {
            return cells.reduce(function (a, b, i) { if (b.getAttribute('aria-pressed') === 'true') a.push(i); return a; }, []);
        }
        out.el = el;
        out.lit = lit;
        out.press = function (i) { if (cells[i]) cells[i].click(); };
        return out;
    }

    /* ---------------------------------------------------------------- the rooms */
    const LEVELS = [

        /* 1 — one sequence of switches --------------------------------------- */
        {
            name: 'The First Latch', t: 30, m: 4,
            goal: 'Throw the four switches in the right order and the latch lifts.',
            hint: 'The order is written on the switches themselves: one mark, then two, then three, then four.',
            why: 'Each catch is hooked to the one before it, so the ladder has to be climbed in order: fewest marks first. Throwing one early let the pin fall and reset the whole row.',
            build: function (room) {
                const shown = ['●●●', '●', '●●●●', '●●'];
                const want = ['●', '●●', '●●●', '●●●●'];
                const count = counter('thrown 0 / 4');
                const sw = seqSwitches(shown, {
                    want: want, aria: 'Latch switches',
                    bad: 'Out of order. The whole latch dropped back.',
                    onStep: function (at) { count.set('thrown ' + at + ' / 4'); },
                    onDone: function () { win(); }
                });
                room.appendChild(rule('The latch opens only if the four switches go in order of their marks, fewest first.'));
                room.appendChild(panel({ s: 'LATCH', f: 'LATCH — four switches' }, [
                    sw.el, count,
                    note('Tap a switch to throw it. It stays lit while the order holds.'),
                    easy('The one you want first is the switch with a single mark.')
                ], 'mb-wide'));
                return function () { want.forEach(function (w) { sw.press(w); }); };
            }
        },

        /* 2 — read the alphabet, key the digits ------------------------------ */
        {
            name: 'The Engraved Face', t: 35, m: 5,
            goal: 'The face is written in the box’s own alphabet. Read it and key four digits.',
            hint: 'The key reads ● = 1, ■ = 3, ▲ = 5, ◆ = 7, so the face ■ ● ◆ ▲ is 3 1 7 5.',
            why: 'The engraved row is a message rather than decoration: every mark stands for one digit and the key panel lists the pairs, so ■ ● ◆ ▲ reads 3175.',
            build: function (room) {
                const shown = ['■', '●', '◆', '▲'];
                const code = shown.map(function (m) { return String(VAL[m]); }).join('');
                const kp = keypad({
                    digits: 4, aria: 'Bolt with four blanks',
                    onEnter: function (got) { if (got === code) win(); else codeMiss(got, code, kp); }
                });
                room.appendChild(rule('The face shows four marks, the key says what each mark is worth, and the bolt wants those four digits in order.'));
                room.appendChild(panel({ s: 'FACE', f: 'FACE — the message' }, [marks(shown, null, 'Marks engraved on the face')]));
                room.appendChild(panel({ s: 'KEY', f: 'KEY — what the marks are worth' }, [
                    keyList(keyFor(shown.concat(['★']))),
                    note('Read the face left to right and press the matching digit for each mark.')
                ]));
                room.appendChild(panel({ s: 'BOLT', f: 'BOLT — four digits' }, [
                    kp.el,
                    note('Press the digits, then SET. CLR wipes the code.')
                ], 'mb-wide'));
                return function () { code.split('').forEach(function (d) { kp.press(d); }); kp.press('SET'); };
            }
        },

        /* 3 — pattern, then the dial ----------------------------------------- */
        {
            name: 'The Turned Key', t: 35, m: 4,
            goal: 'Work out the missing mark, then turn the dial until it sits under the pin.',
            hint: 'Each row slides the three marks one step to the right: ● ■ ▲ then ▲ ● ■, so the last row is ■ ▲ ●. The mark you want is ●.',
            why: 'The rows rotate the same three marks instead of introducing new ones, which fixes the third row as ■ ▲ ●. That mark sits three notches round from where the dial was parked, so three turns bring it under the pin and SET holds it there.',
            build: function (room) {
                const rows = ['● ■ ▲', '▲ ● ■', '■ ▲ ?'];
                const rim = ['◇', '○', '▼', '●', '■', '□', '▲', '◆'];
                const target = rim.indexOf('●');
                const d = dial(rim, {});
                const setBtn = btn('SET', 'ml-btn-hot', function () {
                    if (api.locked) return;
                    api.bumpMoves(1);
                    if (d.at() === target) win();
                    else api.failed('The pin is not over the mark you worked out.');
                }, 'set the dial');
                room.appendChild(rule('One of these three rows is unfinished. Find the missing mark, turn the dial until that mark sits under the red pin, then press SET.'));
                room.appendChild(panel({ s: 'LID', f: 'LID — three rows, one blank' }, [
                    h('div', { class: 'mb-rows' }, rows.map(function (r) { return h('p', { class: 'mb-row3', text: r }); })),
                    note('The second row is the first row moved along one place.')
                ]));
                room.appendChild(panel({ s: 'DIAL', f: 'DIAL — eight marks, one pin' }, [
                    d.el, row([setBtn]),
                    note('Each tap turns the dial one notch.')
                ]));
                return function () { d.turnTo(target); setBtn.click(); };
            }
        },

        /* 4 — interlocking tiles --------------------------------------------- */
        {
            name: 'The Sliding Tray', t: 40, m: 3,
            goal: 'Three of these four tiles chain together. Put them in the tray in that order.',
            hint: 'Only ●→■ can meet the left rail, then ■→▲, then ▲→● closes against the right rail. The ★→◇ tile fits nowhere.',
            why: 'The tray is a chain, not a pile: the rail peg chooses the first tile, each tile’s OUT peg chooses the next, and the last tile has to finish on the rail’s ●. That fixes the order as ●→■, ■→▲, ▲→●. ★→◇ has neither a way in nor a way out.',
            build: function (room) {
                const seq = ['●→■', '■→▲', '▲→●'];
                const tiles = ['●→■', '▲→●', '★→◇', '■→▲'];
                const railIn = '●', railOut = '●';
                const ar = arrange({
                    tiles: tiles, slots: 3, rails: [railIn, railOut], auto: true,
                    accept: function (list) {
                        if (list.length !== 3) return false;
                        if (list[0].charAt(0) !== railIn || list[2].slice(-1) !== railOut) return false;
                        return list[1].charAt(0) === list[0].slice(-1) && list[2].charAt(0) === list[1].slice(-1);
                    },
                    bad: 'The tray will not slide: one joint does not match.'
                });
                room.appendChild(rule('Each tile reads IN → OUT. A tile sits in the tray only where the peg beside it matches, and the last tile has to close against the far rail. Use three of the four.'));
                room.appendChild(h('p', { class: 'mb-railline' }, [
                    h('span', { class: 'mb-rail', text: railIn }),
                    h('span', { class: 'mb-railword', text: 'the tray' }),
                    h('span', { class: 'mb-rail', text: railOut })
                ]));
                room.appendChild(panel({ s: 'TRAY', f: 'TRAY — three slots' }, [
                    ar.el,
                    note('Tap a tile to drop it in the next empty slot, tap a slot to take it back. The tray checks itself when it is full.')
                ], 'mb-wide'));
                room.appendChild(panel({ s: 'SPARE', f: 'SPARE — one tile is a decoy' }, [
                    h('p', { class: 'ml-clue', text: 'The ★→◇ tile is the one that will not go in.' }),
                    easy('While you build, the strip under the tray marks each joint good or bad.')
                ]));
                return function () { seq.forEach(function (t) { ar.press(t); }); ar.commit(); };
            }
        },

        /* 5 — half the clue on the lid, half on the base --------------------- */
        {
            name: 'Two Halves of One Clue', t: 40, m: 5,
            goal: 'Half the combination is engraved on the lid and half on the base. Join them.',
            hint: 'The lid gives ★ ● = 9 1. The base plate is upside down: turned round it reads ▼ ◇ = 6 8. The code is 9168.',
            why: 'This box was assembled from two plates and the combination was deliberately split between them. The lid gives ★ ●, that is 9 and 1, and the base plate is bolted on upside down, so turned round its engraving reads ▼ ◇, that is 6 and 8. Two halves, one code: 9168.',
            build: function (room) {
                const top = ['★', '●'], bottom = ['▼', '◇'];
                const code = top.concat(bottom).map(function (m) { return String(VAL[m]); }).join('');
                const kp = keypad({
                    digits: 4, aria: 'Bolt with four blanks',
                    onEnter: function (got) { if (got === code) win(); else codeMiss(got, code, kp); }
                });
                room.appendChild(rule('The bolt wants four digits. The lid engraves the first two and the base plate engraves the last two.'));
                room.appendChild(panel({ s: 'LID', f: 'LID — the first two' }, [marks(top)]));
                room.appendChild(panel({ s: 'BASE', f: 'BASE — the last two, bolted on upside down' }, [
                    marks(bottom, 'mb-invert'),
                    G() >= 2 ? marks(bottom, 'mb-ghost', 'The same engraving turned the right way up') : null,
                    note('A row turned upside down reads in reverse order and every mark flips top to bottom: ▲ becomes ▼, ◆ becomes ◇.'),
                    easy('The second row above is the base turned round, which the key calls 6 then 8.')
                ]));
                room.appendChild(panel({ s: 'KEY', f: 'KEY — what the marks are worth' }, [keyList(KEYALL)]));
                room.appendChild(panel({ s: 'BOLT', f: 'BOLT — four digits' }, [kp.el, note('Digits, then SET.')]));
                return function () { code.split('').forEach(function (d) { kp.press(d); }); kp.press('SET'); };
            }
        },

        /* 6 — the hidden interaction ---------------------------------------- */
        {
            name: 'The Loose Plate', t: 30, m: 4,
            goal: 'Two digits. Only one of the two marks you need has a value on the key.',
            hint: 'The plate on the left of the room is set at an angle and it is not bolted down. Lift it. The catch underneath carries the value of ■.',
            why: 'The lid asks for ● ■ but the key only lists ●, so the room cannot be read off its labels. The crooked plate is a catch: lift it and the box-maker’s stamp ■ = 3 is underneath, which makes the code 13.',
            build: function (room) {
                const shown = ['●', '■'];
                const code = String(VAL['●']) + String(VAL['■']);
                const kp = keypad({
                    digits: 2, aria: 'Bolt with two blanks',
                    onEnter: function (got) { if (got === code) win(); else codeMiss(got, code, kp); }
                });
                const plate = thing({
                    icon: 'fa-square', cls: 'mb-thing-loose', label: 'a plate, set at an angle',
                    aria: 'Loose plate set at an angle, tap to lift it', reveal: '■ = 3',
                    onToggle: function (open) { if (open) api.say('Under the plate somebody stamped ■ = 3.'); }
                });
                room.appendChild(rule('The bolt wants two digits and the lid engraves the two marks they stand for. Only some of the marks are listed on the key.'));
                room.appendChild(panel({ s: 'LID', f: 'LID — the two marks' }, [marks(shown)]));
                room.appendChild(panel({ s: 'PLATE', f: 'PLATE — is this bolted down?' }, [
                    plate.el,
                    nudge('That plate is not sitting straight. Plates like that usually lift.')
                ]));
                room.appendChild(panel({ s: 'KEY', f: 'KEY — all it lists' }, [
                    keyList([{ m: '●', v: 1 }, { m: '★', v: 9 }]),
                    h('p', { class: 'ml-clue', text: '■ does not appear on this list.' })
                ]));
                room.appendChild(panel({ s: 'BOLT', f: 'BOLT — two digits' }, [kp.el, note('Digits, then SET.')]));
                return function () { plate.open(); code.split('').forEach(function (d) { kp.press(d); }); kp.press('SET'); };
            }
        },

        /* 7 — symbol reading over a mosaic ---------------------------------- */
        {
            name: 'Count The Marks', t: 45, m: 5,
            goal: 'Light every cell that stands for an even digit, then set the mosaic.',
            hint: 'The even values on the key are 2 4 6 8, which are ○ □ ▼ ◇. Four cells carry those marks.',
            why: 'The mosaic buries four of the even-valued marks among five odd ones. ○ 2, □ 4, ▼ 6 and ◇ 8 light; ● 1, ■ 3, ▲ 5, ◆ 7 and ★ 9 stay dark, because the inlay is wired to a parity switch rather than to the picture.',
            build: function (room) {
                const grid = ['●', '○', '■', '□', '▲', '◆', '▼', '★', '◇'];
                const want = [];
                grid.forEach(function (mk, i) { if (VAL[mk] % 2 === 0) want.push(i); });
                const count = counter('lit 0');
                const mo = mosaic(grid, { onStep: function (n) { count.set('lit ' + n); } });
                const setBtn = btn('SET THE MOSAIC', 'ml-btn-hot', function () {
                    if (api.locked) return;
                    api.bumpMoves(1);
                    if (mo.lit().join(',') === want.join(',')) win();
                    else api.failed('That is not the even set.');
                }, 'set the mosaic');
                room.appendChild(rule('Light every cell whose mark stands for an EVEN digit, then press SET. Tap a lit cell again to put it out.'));
                room.appendChild(panel({ s: 'MOSAIC', f: 'MOSAIC — nine cells' }, [
                    mo.el, row([setBtn, count]),
                    note('A cell lights when you tap it.')
                ]));
                room.appendChild(panel({ s: 'KEY', f: 'KEY — what the marks are worth' }, [
                    keyList(KEYALL),
                    note('Even digits are 2 4 6 8.')
                ]));
                return function () { want.forEach(function (i) { mo.press(i); }); setBtn.click(); };
            }
        },

        /* 8 — two bolts fed from one engraved row --------------------------- */
        {
            name: 'Two Locks, One Key', t: 60, m: 6,
            goal: 'One engraved row feeds two bolts: three digits into one, one digit into the other.',
            hint: 'The cornered marks are ■ ▲ ◆ = 3 5 7 for the bolt with three blanks. The round one is ● = 1 for the bolt with one blank.',
            why: 'A single engraved row turns out to be two messages at once. One bolt is cut for angular marks only (■ ▲ ◆, that is 357) and the other accepts a single round mark, which leaves ● at 1. Both bolts have to be fed before the box gives.',
            build: function (room) {
                const shown = ['●', '■', '▲', '◆'];
                const up = shown.filter(function (m) { return CORNERED.indexOf(m) >= 0; });
                const lo = shown.filter(function (m) { return CORNERED.indexOf(m) < 0; });
                const ucode = up.map(function (m) { return String(VAL[m]); }).join('');
                const lcode = lo.map(function (m) { return String(VAL[m]); }).join('');
                const done = { u: false, l: false };
                function both() { if (done.u && done.l) win(); }
                const ku = keypad({
                    digits: ucode.length, aria: 'Bolt with three blanks',
                    onEnter: function (got) {
                        if (got === ucode) { done.u = true; api.say('The upper bolt throws.'); both(); }
                        else { api.failed('The upper bolt stays put.'); ku.reset(); }
                    }
                });
                const kl = keypad({
                    digits: lcode.length, aria: 'Bolt with one blank',
                    onEnter: function (got) {
                        if (got === lcode) { done.l = true; api.say('The lower bolt throws.'); both(); }
                        else { api.failed('The lower bolt stays put.'); kl.reset(); }
                    }
                });
                room.appendChild(rule('Two bolts on one door. The bolt with three blanks only takes marks that have corners; the bolt with one blank only takes a round mark. The lid engraves all four marks and the key gives their values.'));
                room.appendChild(panel({ s: 'LID', f: 'LID — four marks, two messages' }, [marks(shown)]));
                room.appendChild(panel({ s: 'KEY', f: 'KEY — what the marks are worth' }, [
                    keyList(KEYALL),
                    note('Cornered: ■ □ ▲ ◆ ◇ ★. Round: ● ○.')
                ]));
                room.appendChild(panel({ s: 'UPPER BOLT', f: 'UPPER BOLT — three blanks' }, [ku.el, note('Digits, then SET.')]));
                room.appendChild(panel({ s: 'LOWER BOLT', f: 'LOWER BOLT — one blank' }, [kl.el, note('Digits, then SET.')]));
                return function () {
                    ucode.split('').forEach(function (d) { ku.press(d); }); ku.press('SET');
                    lcode.split('').forEach(function (d) { kl.press(d); }); kl.press('SET');
                };
            }
        },

        /* 9 — latch, then dial, then digits -------------------------------- */
        {
            name: 'The Long Combination', t: 120, m: 10,
            goal: 'Catches first, then the dial, then four digits. Three locks in a row.',
            hint: 'Throw ●●● then ●● then ●. The lid marks ■ ● are 3 and 1 and their total is 4, so park the pointer on the mark worth 4, that is □, two turns. The window inside reads 6 2, so the code is 3162.',
            why: 'The catches have to drop before the dial carries any load. The lid gives two digits straight off the key (■ = 3, ● = 1) and their total, 4, names the notch to park on because the mark worth 4 is □. Parking the pointer there slides an inspection window open and the window is stamped 6 2, so the four digits are 3 1 6 2.',
            build: function (room) {
                const shown = ['●●●', '●', '●●'];
                const want = ['●●●', '●●', '●'];
                const lid = ['■', '●'];
                const rim = ['●', '▲', '□', '◆', '○', '■', '▼', '◇'];
                const target = rim.indexOf('□');
                const sum = lid.reduce(function (a, m) { return a + VAL[m]; }, 0);
                const stamped = '62';
                const code = lid.map(function (m) { return String(VAL[m]); }).join('') + stamped;
                let armed = false;
                const count = counter('thrown 0 / 3');
                const winEl = marks(['6', '2'], 'mb-window', 'Digits stamped inside the window');
                winEl.hidden = true;
                const kp = keypad({
                    digits: 4, aria: 'Bolt with four blanks',
                    onEnter: function (got) { if (got === code) win(); else codeMiss(got, code, kp); }
                });
                const d = dial(rim, {
                    onTurn: function (at) {
                        const a = at === target;
                        if (a && !armed) api.say('Something slides open inside the case.');
                        armed = a;
                        winEl.hidden = !a;
                    }
                });
                const sw = seqSwitches(shown, {
                    want: want, aria: 'Three catches',
                    bad: 'Wrong catch. The latch drops and the dial locks again.',
                    onStep: function (at) {
                        count.set('thrown ' + at + ' / 3');
                        if (at < want.length) { armed = false; winEl.hidden = true; }
                    },
                    onDone: function () { api.say('Three catches home; the dial is free now.'); }
                });
                room.appendChild(rule('Four digits on one bolt. The first two are the lid marks read off the key; their total names the notch to park the dial on, and the window that opens there is stamped with the last two.'));
                room.appendChild(panel({ s: 'CATCHES', f: 'CATCHES — throw them most marks first' }, [
                    sw.el, count,
                    note('A catch thrown early drops the row.'),
                    easy('The dial will not carry any load until all three catches are home.')
                ]));
                room.appendChild(panel({ s: 'LID', f: 'LID — the first two digits' }, [marks(lid)]));
                room.appendChild(panel({ s: 'DIAL', f: 'DIAL — park the pointer on a mark' }, [d.el, note('Each tap turns one notch.')]));
                room.appendChild(panel({ s: 'WINDOW', f: 'WINDOW — inside the case' }, [winEl]));
                room.appendChild(panel({ s: 'KEY', f: 'KEY — what the marks are worth' }, [keyList(KEYALL)]));
                room.appendChild(panel({ s: 'BOLT', f: 'BOLT — four digits' }, [kp.el, note('Digits, then SET. CLR wipes.')]));
                return function () {
                    want.forEach(function (w) { sw.press(w); });
                    d.turnTo(target);
                    code.split('').forEach(function (x) { kp.press(x); });
                    kp.press('SET');
                };
            }
        },

        /* 10 — five inlays, a symmetric row --------------------------------- */
        {
            name: 'The Mosaic Lid', t: 45, m: 6,
            goal: 'Five inlays. Make a row that reads the same from either end.',
            hint: '■ is the only mark with no twin, so it owns the middle: ● ▲ ■ ▲ ● works, and so does ▲ ● ■ ● ▲ and ■ ● ▲ ● ■.',
            why: 'A five-long row that reads backwards the same as forwards is symmetric about its middle tile, so whatever sits in position three has to appear twice over on either side of it. Only ■ has no twin, so ■ takes the centre and the two pairs fill the wings. Any of the three symmetric rows seats the lid.',
            build: function (room) {
                const tiles = ['●', '●', '▲', '▲', '■'];
                const sol = ['●', '▲', '■', '▲', '●'];
                const count = counter('placed 0 / 5');
                const ar = arrange({
                    tiles: tiles, slots: 5,
                    accept: function (list) {
                        for (let i = 0; i < list.length; i++) if (list[i] !== list[list.length - 1 - i]) return false;
                        return true;
                    },
                    bad: 'The lid does not seat; the row does not read the same backwards.',
                    onStep: function (list) { count.set('placed ' + list.length + ' / 5'); }
                });
                room.appendChild(rule('The lid takes all five inlays and only seats if the row reads the same from either end. More than one arrangement does that — any symmetric row will set it.'));
                room.appendChild(panel({ s: 'LID', f: 'LID — five slots' }, [
                    ar.el, count,
                    note('Tap a tile to drop it in the next empty slot, tap a slot to take it back, then press SET THE ROW.')
                ], 'mb-wide'));
                return function () { sol.forEach(function (t) { ar.press(t); }); ar.commit(); };
            }
        },

        /* 11 — half the clue on a plate hung backwards ---------------------- */
        {
            name: 'The Mirrored Plate', t: 50, m: 5,
            goal: 'The key for this bolt is in the room, but it is hanging the wrong way round.',
            hint: 'The plate in the middle of the room is loose in its frame. Tap it, or tap the mirror, which swings it for you, and the key reads ● = 1 ■ = 3 ▲ = 5 ◆ = 7 ★ = 9.',
            why: 'The plate swings in its frame and somebody left it hung backwards: the whole row is mirror-reversed, so the order of the pairs is reversed and every glyph in them reads backwards. Swung round it is an ordinary key, and the lid ★ ◆ ● is then 9 7 1.',
            build: function (room) {
                const shown = ['★', '◆', '●'];
                const pairs = [{ m: '●', v: 1 }, { m: '■', v: 3 }, { m: '▲', v: 5 }, { m: '◆', v: 7 }, { m: '★', v: 9 }];
                const code = shown.map(function (m) { return String(VAL[m]); }).join('');
                const kp = keypad({
                    digits: 3, aria: 'Bolt with three blanks',
                    onEnter: function (got) { if (got === code) win(); else codeMiss(got, code, kp); }
                });
                const plate = flipPlate({
                    front: pairs.map(function (p) { return p.m + ' = ' + p.v; }),
                    back: pairs.slice().reverse().map(function (p) { return p.m + ' = ' + p.v; }),
                    startFront: false
                });
                const mirror = thing({
                    icon: 'fa-circle-half-stroke', cls: 'mb-thing-mirror', label: 'a mirror on a swivel',
                    aria: 'Mirror on a swivel, tap to swing it round', reveal: '',
                    onToggle: function (open) { plate.showFront(open); if (open) api.say('The mirror swings the plate round for you.'); }
                });
                room.appendChild(rule('The bolt wants three digits. The lid engraves the marks and the key that gives them values hangs on the plate in the middle of the room.'));
                room.appendChild(panel({ s: 'LID', f: 'LID — the three marks' }, [marks(shown)]));
                room.appendChild(panel({ s: 'PLATE', f: 'PLATE — the key, hung backwards' }, [
                    plate.el,
                    note('Tap the plate and it swings round to the readable side.')
                ]));
                room.appendChild(panel({ s: 'MIRROR', f: 'MIRROR — nobody mentioned this' }, [
                    mirror.el,
                    nudge('The mirror is on a swivel and it is already angled towards the plate.')
                ]));
                room.appendChild(panel({ s: 'BOLT', f: 'BOLT — three digits' }, [kp.el, note('Digits, then SET.')]));
                return function () { plate.showFront(true); code.split('').forEach(function (d) { kp.press(d); }); kp.press('SET'); };
            }
        },

        /* 12 — everything, split in three places --------------------------- */
        {
            name: 'The Impossible Box', t: 150, m: 12,
            goal: 'Everything at once: two catches, a dial, a plate nobody mentions, four digits.',
            hint: 'Throw ● before ■; the key calls them 1 then 3. The bolt has four blanks, so park the pointer on the mark worth 4: that is □, two turns, then SET, and the window reads ▲ ●. Lift the loose underside plate for ◆ ■. The key turns ▲ ● ◆ ■ into 5 1 7 3.',
            why: 'Nothing on this box is a whole clue. The catch order is the first pair of values in the key, small first. The notch to park the dial on is named by the bolt itself: four blanks, and the mark worth 4 is □. Parking there opens an inspection window engraved ▲ ●. The other half of the message, ◆ ■, is under a plate on the underside that nothing tells you to lift. The key turns ▲ ● ◆ ■ into 5 1 7 3.',
            build: function (room) {
                const shown = ['●', '■'];
                const want = ['●', '■'];
                const rim = ['▲', '■', '□', '●', '◆', '○', '▼', '◇'];
                const target = rim.indexOf('□');
                const topPair = ['▲', '●'], botPair = ['◆', '■'];
                const code = topPair.concat(botPair).map(function (m) { return String(VAL[m]); }).join('');
                let armed = false;
                const count = counter('thrown 0 / 2');
                const winEl = marks(topPair, 'mb-window', 'Marks inside the inspection window');
                winEl.hidden = true;
                const kp = keypad({
                    digits: 4, aria: 'Bolt with four blanks',
                    onEnter: function (got) { if (got === code) win(); else codeMiss(got, code, kp); }
                });
                const plate = thing({
                    icon: 'fa-square-full', cls: 'mb-thing-loose', label: 'a plate on the underside',
                    aria: 'Loose plate on the underside, tap to lift it', reveal: botPair.join(' ') + ' → 7 3',
                    onToggle: function (open) { if (open) api.say('Under it: ◆ ■, which the key calls 7 and 3.'); }
                });
                const d = dial(rim, {
                    onTurn: function (at) {
                        armed = at === target;
                        winEl.hidden = !armed;
                    }
                });
                const setBtn = btn('SET', 'ml-btn-hot', function () {
                    if (api.locked) return;
                    api.bumpMoves(1);
                    if (armed) { winEl.hidden = false; api.say('The window reads ▲ ●. The other half is not on this face.'); }
                    else api.failed('Nothing opens at that notch.');
                }, 'set the dial');
                const sw = seqSwitches(shown, {
                    want: want, aria: 'Two catches',
                    bad: 'Wrong catch. The dial locks again.',
                    onStep: function (at) {
                        count.set('thrown ' + at + ' / 2');
                        if (at < want.length) { armed = false; winEl.hidden = true; }
                    }
                });
                room.appendChild(rule('The last box: two catches, one dial, one bolt of four digits. The catches go in order of what their marks are worth, smallest first. The dial wants the notch whose mark is worth the number of blanks on the bolt, and SET is what swings the window open there. The digits themselves are split in two: half in that window, half under a plate nobody mentions.'));
                room.appendChild(panel({ s: 'CATCHES', f: 'CATCHES — throw them in order of value' }, [
                    sw.el, count,
                    note('The key says what each mark is worth. The bolt is dead until both catches are home.')
                ]));
                room.appendChild(panel({ s: 'DIAL', f: 'DIAL — the notch the bolt describes' }, [
                    d.el, row([setBtn]),
                    note('Four blanks on the bolt, so the notch to park on is the mark worth 4. Turn, then press SET.'),
                    easy('Two turns brings □ under the pin, and the key calls □ worth 4.')
                ]));
                room.appendChild(panel({ s: 'WINDOW', f: 'WINDOW — opens at the right notch' }, [winEl]));
                room.appendChild(panel({ s: 'UNDERSIDE', f: 'UNDERSIDE — a plate sits here' }, [
                    plate.el,
                    nudge('That underside plate is the only thing in the room with no label and no obvious job.')
                ]));
                room.appendChild(panel({ s: 'KEY', f: 'KEY — what the marks are worth' }, [keyList(KEYALL)]));
                room.appendChild(panel({ s: 'BOLT', f: 'BOLT — four digits' }, [kp.el, note('Digits, then SET. CLR wipes.')]));
                return function () {
                    want.forEach(function (w) { sw.press(w); });
                    d.turnTo(target);
                    setBtn.click();
                    plate.open();
                    code.split('').forEach(function (x) { kp.press(x); });
                    kp.press('SET');
                };
            }
        }
    ];

    /* ------------------------------------------------------------- rendering */
    function play(i) {
        const L = LEVELS[i];
        if (!L) { api.finish(); return; }
        solver = null;
        /* a room left open when the next one started was walked away from */
        if (i > 0 && log[i - 1] && log[i - 1].out === 'open') log[i - 1].out = 'skipped';
        api.setLevel(i, L.name, LEVELS.length);
        const par = parFor(L);
        api.setPar(par.ms, par.moves);
        api.setHint(L.hint);
        api.explain(L.why);
        log[i] = { name: L.name, out: 'open', moves: 0 };

        const host = api.host;
        host.innerHTML = '';
        host.appendChild(h('p', { class: 'ml-label mb-roomname', text: 'Room ' + (i + 1) + ' of ' + LEVELS.length + ' · ' + L.name }));
        const room = h('div', { class: 'ml-room mb-room' });
        host.appendChild(room);
        solver = L.build(room) || null;
        api.say(L.goal);
    }

    /* --------------------------------------------------------------- review */
    function review() {
        const rows = [];
        LEVELS.forEach(function (L, n) {
            const r = log[n];
            if (!r) return;
            const mark = r.out === 'right' ? 'fa-circle-check' : r.out === 'skipped' ? 'fa-door-open' : 'fa-circle-xmark';
            const word = r.out === 'right' ? 'opened' : r.out === 'skipped' ? 'walked away from' : 'left shut';
            rows.push(h('div', { class: 'ml-review-row' }, [
                h('p', { class: 'ml-review-q', html: '<i class="fas ' + mark + '" aria-hidden="true"></i> Room ' + (n + 1) + ' · ' + esc(L.name) + ' — ' + word }),
                h('p', { class: 'ml-fine', text: L.why })
            ]));
        });
        if (!rows.length) return [];
        return [h('div', { class: 'ml-review' }, [h('h4', { class: 'ml-review-title', text: 'Every room, and what was inside it' })].concat(rows))];
    }

    /* ------------------------------------------------------------- register */
    M.register('box', {
        rules: function () {
            return [
                'Twelve rooms, each one a mechanism: switches, dials, marks, keypads, tiles.',
                'Read before you touch. Every box prints the rule that opens it.',
                'The marks are an alphabet. A panel headed KEY says which mark is which digit.',
                'Half a clue often waits somewhere else in the same room. Join the halves.',
                'Tap a switch to throw it, a dial to turn it, a tile to slot it, the slot to take it back.',
                'A keypad takes digits then SET. CLR wipes what you typed.',
                'Anything loose, crooked or too plain to be decoration is a control as well.',
                'Open a room for 100 x difficulty plus speed and neatness. Wrong 5, hint 25, skip 20, restart free.',
                'Difficulty changes how much the room tells you, never which puzzle it is.',
                'Two-player modes share this device. No online play, nothing leaves the browser.'
            ];
        },
        start: function (a) {
            api = a;
            log = [];
            a.onReset(play);
            play(0);
        },
        next: function (a) {
            if (a.level + 1 >= LEVELS.length) { a.finish(); return; }
            play(a.level + 1);
        },
        /* Drives the real switches, the real dial, the real keys and the real
           loose plate, so the self-test proves the room opens by touch rather
           than that an answer exists somewhere on paper. */
        solve: function (a) {
            if (a) api = a;
            if (!api || api.locked || !solver) return;
            solver();
        },
        review: review
    });
})();
