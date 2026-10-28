/* ==========================================================================
   GLITCH THE REALITY — twenty trick rooms.
   The premise the player is told before level one: the instruction in these
   rooms is doing its best to mislead you, and the decoration is sometimes the
   control. Every room is authored with one verified solution, a hint, an
   explanation and a clean rebuild from its index alone.

   Browser only: no network, no dependencies, no build step, no ES modules.
   Drags are pointer-based so they work under a finger; every room also has a
   tap-then-tap-the-target fallback, every control is a real button or input,
   and nothing has to be hovered to be found.
   ========================================================================== */
(function () {
    'use strict';
    const M = window.MindLab;
    if (!M) return;

    if (!document.querySelector('link[href="arcade/glitch.css"]')) {
        const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'arcade/glitch.css'; document.head.appendChild(l);
    }

    const h = M.h;

    /* ------------------------------------------------------------ run state */
    let api = null, solver = null, log = [], cleanups = [];
    let picked = null, overZone = null, lastUp = 0;

    function allow() { return !!api && !api.locked; }
    function bump() { api.bumpMoves(1); }
    function act() { bump(); M.sfx.click(); }
    function win() {
        if (!allow()) return;
        log[api.level].out = 'right';
        api.solved({});
    }
    function miss(msg) { if (allow()) api.failed(msg || 'Not it.'); }
    function say(t) { if (api) api.say(t); }

    /* Difficulty tightens par, and at Hard the room stops pointing at things. */
    function sgn() { return api.difficulty !== 'Hard'; }
    function parFor(ms, mv) {
        const d = api.difficulty;
        if (d === 'Easy') return [Math.round(ms * 1.6), mv + 1];
        if (d === 'Hard') return [Math.round(ms * 0.68), mv];
        return [ms, mv];
    }
    function norm(v) { return String(v == null ? '' : v).trim().toLowerCase().replace(/[\s\-_.,]+/g, ''); }

    /* --------------------------------------------------------- DOM utilities */
    function cl(cls, tag) { const e = document.createElement(tag || 'div'); e.className = cls; return e; }
    function txt(el, t) { el.textContent = t == null ? '' : String(t); return el; }
    function on(el, type, fn) { el.addEventListener(type, fn); return el; }

    function makeRoom() {
        const r = cl('ml-glitch mz-room');
        api.host.appendChild(r);
        if (!api.reduced()) r.classList.add('mz-anim');
        return r;
    }
    function addPrompt(r, text) { return txt(cl('ml-gtext', 'p'), text); }
    function addNote(r, text) {
        if (!sgn()) return null;
        r.appendChild(txt(cl('ml-hidden-note', 'p'), text));
        return r.lastChild;
    }
    function addField(r, height) {
        const f = cl('mz-field');
        if (height) f.style.minHeight = height + 'px';
        r.appendChild(f);
        return f;
    }
    function addLine(host, text, cls) { host.appendChild(txt(cl('mz-line ' + (cls || ''), 'span'), text)); }
    function button(label, fn, cls) {
        return h('button', {
            class: 'ml-btn ' + (cls || ''), type: 'button',
            onclick: function () { if (!allow()) return; act(); fn(); }
        }, label);
    }
    function slider(opt) {
        const s = h('input', {
            class: 'ml-slider', type: 'range',
            min: opt.min == null ? 0 : opt.min, max: opt.max == null ? 100 : opt.max,
            value: opt.value == null ? (opt.min || 0) : opt.value,
            'aria-label': opt.label || 'dial'
        });
        let last = null;
        function apply() {
            const v = Number(s.value);
            if (v === last) return;
            last = v;
            if (opt.onValue) opt.onValue(v);
        }
        /* one move per gesture, not one per pixel the thumb travels */
        on(s, 'pointerdown', function () { if (allow()) bump(); });
        on(s, 'keydown', function (e) {
            if (!allow()) return;
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].indexOf(e.key) < 0) return;
            bump();
        });
        on(s, 'input', apply);
        on(s, 'change', apply);
        s.__set = function (v) { s.value = String(v); bump(); apply(); };
        return s;
    }

    /* ------------------------------------------------------------ pointer drag
       One engine for everything moveable. pointerdown / pointermove / pointerup
       with setPointerCapture, drop hit-testing through elementFromPoint, and a
       tap-to-pick + tap-the-target fallback so a finger, a mouse and a keyboard
       all end up in the same deliver() function. */
    function piecePos(el, x, y, fieldEl) {
        const fw = fieldEl.clientWidth, fh = fieldEl.clientHeight;
        const w = el.offsetWidth, ht = el.offsetHeight;
        el.style.left = Math.max(0, Math.min(x, Math.max(0, fw - w))) + 'px';
        el.style.top = Math.max(0, Math.min(y, Math.max(0, fh - ht))) + 'px';
    }
    function placeAt(el, fieldEl, xp, yp) {
        el.style.left = Math.round(fieldEl.clientWidth * xp) + 'px';
        el.style.top = Math.round(fieldEl.clientHeight * yp) + 'px';
        el.__home = { left: el.style.left, top: el.style.top };
        el.__shift = '';
        return el;
    }
    function goHome(el) {
        const hm = el.__home;
        if (!hm || !el.parentNode || !el.__field) return;
        const fl = el.__field.getBoundingClientRect(), er = el.getBoundingClientRect();
        const nx = fl.left + parseFloat(hm.left), ny = fl.top + parseFloat(hm.top);
        el.__shift = 'translate(' + Math.round(nx - er.left) + 'px,' + Math.round(ny - er.top) + 'px)';
        el.style.transform = el.__shift;
    }
    function zoneAt(x, y) {
        let el = null;
        try { el = document.elementFromPoint(x, y); } catch (e) { el = null; }
        while (el) { if (el.__zone) return el; el = el.parentElement; }
        return null;
    }
    function markOver(z) {
        if (overZone === z) return;
        if (overZone) overZone.classList.remove('is-over');
        overZone = z || null;
        if (overZone) overZone.classList.add('is-over');
    }
    function clearPicked() { if (picked) picked.classList.remove('is-picked'); picked = null; }

    function deliver(el, zone) {
        clearPicked(); markOver(null);
        el.classList.remove('is-dragging');
        const dopt = zone.__dropOpt || {}, opt = el.__dragOpt || {};
        el.style.pointerEvents = '';
        if (dopt.accept && !dopt.accept(el)) { bounce(el); return; }
        if (opt.accept && !opt.accept(zone)) { bounce(el); return; }
        bump();
        if (dopt.onArrive) dopt.onArrive(el);
        if (opt.into === 'slot' || dopt.into === 'slot') {
            el.__shift = ''; el.style.transform = '';
            el.style.left = ''; el.style.top = '';
            el.classList.remove('mz-piece'); el.classList.add('mz-slotted');
            while (el.firstChild) zone.appendChild(el.firstChild);
            el.style.display = 'none';
            el.setAttribute('aria-hidden', 'true');
            zone.classList.remove('is-over');
        }
        if (opt.onDeliver) opt.onDeliver(zone, el);
    }
    function bounce(el) {
        const opt = el.__dragOpt || {};
        el.style.pointerEvents = '';
        el.classList.remove('is-dragging');
        goHome(el);
        if (opt.wrong) miss(opt.wrong);
    }
    function draggable(el, opt) {
        opt = opt || {}; el.__dragOpt = opt;
        el.classList.add('ml-drag', 'mz-piece');
        if (!el.getAttribute('type')) el.setAttribute('type', 'button');
        const fieldEl = opt.field || el.parentNode;
        el.__field = fieldEl;
        if (sgn() && opt.tag) el.appendChild(h('span', { class: 'mz-tag', 'aria-hidden': 'true', text: opt.tag }));
        if (opt.pinned !== true) {
            const fl = fieldEl.getBoundingClientRect(), er = el.getBoundingClientRect();
            opt.baseX = Math.round(er.left - fl.left); opt.baseY = Math.round(er.top - fl.top);
            el.style.left = opt.baseX + 'px'; el.style.top = opt.baseY + 'px';
        }
        if (!el.__home) el.__home = { left: el.style.left, top: el.style.top };
        let d = null;
        on(el, 'pointerdown', function (e) {
            if (!allow() || el.classList.contains('mz-slotted')) return;
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            let ox = opt.baseX, oy = opt.baseY;
            if (ox == null) {
                const fl = fieldEl.getBoundingClientRect(), er = el.getBoundingClientRect();
                ox = Math.round(er.left - fl.left); oy = Math.round(er.top - fl.top);
            }
            d = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: ox, oy: oy, moved: false };
            try { el.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
        });
        on(el, 'pointermove', function (e) {
            if (!d || e.pointerId !== d.id) return;
            const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
            if (!d.moved) {
                if (Math.abs(dx) + Math.abs(dy) < 9) return;
                d.moved = true;
                el.classList.add('is-dragging');
                el.style.pointerEvents = 'none';
                if (el.__shift) { el.style.transform = ''; el.__shift = ''; }
            }
            piecePos(el, d.ox + dx, d.oy + dy, fieldEl);
            markOver(zoneAt(e.clientX, e.clientY));
            if (opt.onMove) opt.onMove(e);
        });
        on(el, 'pointerup', function (e) {
            if (!d || e.pointerId !== d.id) return;
            const moved = d.moved;
            d = null; lastUp = Date.now();
            el.classList.remove('is-dragging');
            if (moved) {
                /* hit-test while the piece is still transparent to pointers,
                   otherwise it covers the very point we are asking about */
                const z = zoneAt(e.clientX, e.clientY);
                el.style.pointerEvents = '';
                markOver(null);
                if (z) deliver(el, z);
                else if (opt.onDrop) opt.onDrop(e);
                else if (opt.onMove) opt.onMove(e);
            } else tapPiece(el);
        });
        on(el, 'pointercancel', function () {
            if (!d) return;
            d = null;
            el.classList.remove('is-dragging');
            el.style.pointerEvents = '';
            markOver(null); goHome(el);
        });
        on(el, 'click', function (e) {
            e.preventDefault();
            if (Date.now() - lastUp < 700) return;      /* a pointer tap already ran */
            tapPiece(el);
        });
        return el;
    }
    function tapPiece(el) {
        if (!allow() || el.classList.contains('mz-slotted')) return;
        const opt = el.__dragOpt || {};
        if (opt.onTap) { act(); opt.onTap(el); return; }
        if (picked === el) { clearPicked(); return; }
        clearPicked(); picked = el; el.classList.add('is-picked');
        M.sfx.click();
        say('Picked up \u201c' + (opt.name || 'it') + '\u201d. Now tap where it goes.');
    }
    function zone(el, opt) {
        opt = opt || {}; el.__zone = true; el.__dropOpt = opt;
        if (!el.classList.contains('ml-drop')) el.classList.add('ml-drop');
        if (el.tagName === 'BUTTON' && !el.getAttribute('type')) el.setAttribute('type', 'button');
        if (sgn() && opt.targeted !== false) el.classList.add('mz-target');
        on(el, 'click', function () {
            if (Date.now() - lastUp < 700) return;
            if (!allow() || !picked) return;
            deliver(picked, el);
        });
        return el;
    }
    function makePiece(text, xp, yp, fieldEl, opt) {
        const b = h('button', { class: 'mz-stub', type: 'button', text: text, 'aria-label': opt.aria || ('the word ' + text) });
        fieldEl.appendChild(b);
        placeAt(b, fieldEl, xp, yp);
        draggable(b, Object.assign({ pinned: true }, opt));
        return b;
    }
    function makeBin(label, icon) {
        const b = h('button', { class: 'ml-drop mz-zone mz-bin', type: 'button', 'aria-label': label });
        b.appendChild(h('i', { class: 'fas ' + (icon || 'fa-trash-can'), 'aria-hidden': 'true' }));
        b.appendChild(document.createTextNode(label));
        return b;
    }
    function simDrag(el, dest) {
        const a = el.getBoundingClientRect(), b = dest.getBoundingClientRect();
        const sx = a.left + a.width / 2, sy = a.top + a.height / 2;
        el.dispatchEvent(pt('pointerdown', sx, sy));
        const tx = b.left + b.width / 2, ty = b.top + b.height / 2;
        for (let i = 1; i <= 4; i++) el.dispatchEvent(pt('pointermove', Math.round(sx + (tx - sx) * i / 4), Math.round(sy + (ty - sy) * i / 4)));
        el.dispatchEvent(pt('pointerup', tx, ty));
    }
    function pt(type, x, y) {
        return new PointerEvent(type, {
            bubbles: true, cancelable: true, composed: true, pointerId: 777,
            pointerType: 'touch', isPrimary: true, clientX: x, clientY: y,
            button: 0, buttons: type === 'pointerup' ? 0 : 1
        });
    }

    /* -------------------------------------------------------- room widgets */
    function answerCtl(r, opt) {
        const wrap = cl('ml-row');
        const input = h('input', {
            class: 'ml-input', type: 'text', autocomplete: 'off', spellcheck: 'false',
            inputmode: opt.digits ? 'numeric' : 'text',
            'aria-label': opt.label || 'your answer', placeholder: opt.placeholder || 'type the answer'
        });
        const go = h('button', { class: 'ml-btn ml-btn-hot', type: 'button' });
        go.appendChild(h('i', { class: 'fas fa-check', 'aria-hidden': 'true' }));
        go.appendChild(document.createTextNode(' ' + (opt.button || 'Answer')));
        function submit() {
            if (!allow()) return;
            const v = norm(input.value);
            if (!v) { say('Type something first.'); return; }
            bump();
            if (opt.check(v)) { input.disabled = true; go.disabled = true; M.sfx.good(); win(); }
            else api.failed(opt.wrong || 'That is not it.');
        }
        on(go, 'click', submit);
        on(input, 'keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
        wrap.appendChild(input); wrap.appendChild(go); r.appendChild(wrap);
        return { input: input, submit: submit, solve: function (v) { input.value = v; submit(); } };
    }

    /* Make words of the instruction itself into controls. decide() returns
       0 = plain text, 1 = decoy word, 2 = the word that matters,
       3 = the word that matters but costs no move and only fires once. */
    function wordsCtl(p, decide, onTap) {
        const parts = String(p.textContent).split(' ');
        p.textContent = '';
        p.classList.add('mz-sentence');
        const out = { all: [], goal: null };
        parts.forEach(function (w, i) {
            if (p.children.length) p.appendChild(document.createTextNode(' '));
            const clean = w.replace(/[^A-Za-z']/g, '').toLowerCase();
            const role = clean ? decide(clean, i) : 0;
            if (!role) { p.appendChild(document.createTextNode(w)); return; }
            const b = h('button', { class: 'mz-word', type: 'button', text: w, 'aria-label': 'the word ' + clean + ' in the instruction' });
            if (role === 2 || role === 3) { if (!out.goal) out.goal = b; }
            on(b, 'click', function () {
                if (!allow()) return;
                if (role === 3) {
                    if (b.__fired) return;
                    b.__fired = true; b.classList.add('is-picked');
                    onTap(w, clean, b); return;
                }
                act();
                if (role === 2) { b.classList.add('is-picked'); onTap(w, clean, b); }
                else api.failed('\u201c' + clean + '\u201d is only a word.');
            });
            p.appendChild(b); out.all.push(b);
        });
        return out;
    }

    /* A plate on a dial: rotate it a half turn to read what was printed upside
       down on it. The dial is a native range input, so touch and keyboard both
       work, and the click-to-quarter-turn is the no-drag fallback. */
    function plateCtl(host, opt) {
        const wrap = cl('mz-panelwrap');
        const plate = h('div', { class: 'mz-plintr', 'aria-hidden': 'true' });
        plate.appendChild(document.createTextNode(opt.big));
        if (opt.fine) plate.appendChild(h('span', { class: 'mz-fineprint', text: opt.fine }));
        wrap.appendChild(plate);
        const q = h('button', { class: 'ml-btn ml-btn-quiet', type: 'button', text: 'Turn a quarter' });
        wrap.appendChild(q);
        host.appendChild(wrap);
        let deg = 0;
        function setDeg(d) {
            deg = d;
            plate.style.transform = 'rotate(' + d + 'deg)';
            if (!opt.at || !opt.onAt) return;
            const off = Math.abs(((d - opt.at + 180 + 360) % 360) - 180);
            if (off <= 9 && !plate.__done) { plate.__done = true; M.sfx.good(); opt.onAt(); }
        }
        on(q, 'click', function () { if (!allow()) return; bump(); setDeg((deg + 90) % 360); });
        const dial = slider({
            min: 0, max: 360, value: 0, label: opt.label || 'rotation of the plate in degrees',
            onValue: setDeg
        });
        host.appendChild(dial);
        setDeg(0);
        return { plate: plate, dial: dial, q: q, setDeg: setDeg };
    }

    /* A panel that claims to be fixed. The corner grip is a real button you can
       drag left and right (or nudge with the arrow keys); the width slider is
       the same control for anybody who would rather not drag. */
    function resizerCtl(fieldEl, opt) {
        const panel = cl('mz-panel');
        const clipped = cl('mz-clipped');
        txt(clipped, opt.text);
        panel.appendChild(clipped);
        const grip = h('button', {
            class: 'mz-grip', type: 'button', 'aria-label': 'drag to widen the panel, arrow keys work too',
            html: '<i class="fas fa-right-left" aria-hidden="true"></i>'
        });
        panel.appendChild(grip);
        fieldEl.appendChild(panel);
        const start = Math.min(opt.start || 150, Math.max(100, fieldEl.clientWidth - 30));
        panel.style.width = start + 'px';
        const full = clipped.scrollWidth + 30;
        const maxW = Math.max(start + 60, Math.min(opt.maxW || 620, Math.max(full + 6, fieldEl.clientWidth - 4)));
        const need = Math.min(maxW, full);
        const sld = slider({
            min: 0, max: 100, value: 0, label: 'width of the panel',
            onValue: function (v) { setW(start + (maxW - start) * v / 100); }
        });
        (opt.sliderHost || fieldEl).appendChild(sld);
        let open = false;
        function setW(w) {
            const nw = Math.max(start, Math.min(maxW, Math.round(w)));
            panel.style.width = nw + 'px';
            sld.value = String(Math.round((nw - start) / Math.max(1, maxW - start) * 100));
            if (!open && nw >= need - 1) {
                open = true; panel.classList.add('is-open');
                M.sfx.good(); if (opt.onOpen) opt.onOpen();
            }
        }
        let g = null, charged = false;
        on(grip, 'pointerdown', function (e) {
            if (!allow()) return;
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            charged = false;
            g = { id: e.pointerId, sx: e.clientX, w: panel.offsetWidth };
            try { grip.setPointerCapture(e.pointerId); } catch (err) {}
        });
        on(grip, 'pointermove', function (e) {
            if (!g || e.pointerId !== g.id) return;
            if (!charged) { charged = true; bump(); }
            setW(g.w + (e.clientX - g.sx));
        });
        on(grip, 'pointerup', function (e) { if (g && e.pointerId === g.id) g = null; });
        on(grip, 'pointercancel', function () { g = null; });
        on(grip, 'keydown', function (e) {
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
            e.preventDefault(); bump();
            setW(panel.offsetWidth + (e.key === 'ArrowRight' ? 18 : -18));
        });
        on(grip, 'click', function (e) {
            e.preventDefault();
            if (Date.now() - lastUp < 700) return;
            if (charged) { charged = false; return; }   /* the drag already charged one move */
            bump(); setW(panel.offsetWidth + 45);
        });
        function dragOpen() {
            const gr = grip.getBoundingClientRect(), pr = panel.getBoundingClientRect();
            const y = Math.round(gr.top + gr.height / 2);
            let x = Math.round(pr.left + pr.width / 2);
            grip.dispatchEvent(pt('pointerdown', x, y));
            const target = Math.round((maxW - start) * 1.1);
            for (let i = 1; i <= 4; i++) {
                x = Math.round(pr.left + pr.width / 2 + target * i / 4);
                grip.dispatchEvent(pt('pointermove', x, y));
            }
            grip.dispatchEvent(pt('pointerup', x, y));
        }
        return { panel: panel, grip: grip, slider: sld, setW: setW, dragOpen: dragOpen, isOpen: function () { return open; } };
    }

    function doorRow(r, opt) {
        const row = cl('ml-row mz-flows');
        const btns = {};
        opt.opts.forEach(function (label) {
            const b = h('button', {
                class: 'mz-stub', type: 'button', style: 'flex:1 1 0', text: label,
                'aria-label': (opt.kind || 'option') + ' ' + label
            });
            on(b, 'click', function () {
                if (!allow()) return;
                act();
                if (label === opt.right) { if (opt.onRight) opt.onRight(b); else { b.classList.add('is-seen'); win(); } }
                else api.failed(opt.wrong ? opt.wrong(label) : 'Not that one.');
            });
            row.appendChild(b); btns[label] = b;
        });
        r.appendChild(row);
        return { row: row, buttons: btns };
    }

    /* A cover you can slide off something: drag it, or tap it and it shuffles
       out of the way. The clue under it is only legible once it stops covering. */
    function coverCtl(fieldEl, opt) {
        const under = cl('mz-under mz-pinned');
        txt(under, opt.text);
        under.style.left = opt.xp * 100 + '%';
        under.style.top = opt.yp * 100 + '%';
        fieldEl.appendChild(under);
        const slab = h('button', { class: 'mz-rug', type: 'button', 'aria-label': opt.aria });
        slab.appendChild(h('i', { class: 'fas ' + (opt.icon || 'fa-rug'), 'aria-hidden': 'true' }));
        slab.style.width = (opt.w || 124) + 'px';
        slab.style.height = (opt.h || 58) + 'px';
        fieldEl.appendChild(slab);
        placeAt(slab, fieldEl, opt.xp, opt.yp);
        let seen = false;
        function check() {
            if (seen) return;
            const a = slab.getBoundingClientRect(), b = under.getBoundingClientRect();
            const ox = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
            const oy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
            if (ox * oy < a.width * a.height * 0.18) {
                seen = true; under.classList.add('is-seen');
                M.sfx.good(); say(opt.revealSay);
                if (opt.onSee) opt.onSee();
            }
        }
        draggable(slab, {
            name: opt.name || 'cover', tag: opt.tag || 'slide', onMove: check, onDrop: check,
            onTap: function (el) { piecePos(el, el.__field.clientWidth - el.offsetWidth - 2, 2, el.__field); check(); }
        });
        return { slab: slab, under: under, isSeen: function () { return seen; }, check: check };
    }

    /* ============================================================== the rooms */
    const LEVELS = [

        /* 01 --------------------------------------------- the instruction lies */
        {
            name: 'The Sign',
            goal: 'Tap the sign this room does not want you to tap.',
            hint: 'You were told the instruction is the trap. Which of these two signs is the instruction?',
            why: 'The sign begging to be pressed is wired to nothing, and the sign forbidding itself is the control. The room\'s instruction was the lie, so the forbidden thing was the way out.',
            par: [16000, 1],
            build: function (r) {
                r.appendChild(addPrompt(r, 'Tap the sign that this room does not want you to tap.'));
                const row = cl('ml-row');
                row.appendChild(button('Press me', function () { miss('That one is begging, which in here means it leads nowhere.'); }));
                const forb = button('Do not press this', function () { win(); }, 'ml-btn-hot');
                row.appendChild(forb);
                r.appendChild(row);
                addNote(r, 'Only one of them is attached to anything, and it is not the friendly one.');
                solver = function () { forb.click(); };
            }
        },

        /* 02 --------------------------------------- the decoration is the UI */
        {
            name: 'Decorated',
            goal: 'Find the one thing the moonlight touches.',
            hint: 'Take the sentence literally: follow the beam of moonlight to where it lands, then press that.',
            why: 'The beam is drawn from the moon to the little sun ornament, and the sun is a real control even though it is painted like scenery. The big EXIT orb is a decoy \u2014 nothing in the room says it is lit.',
            par: [24000, 1],
            build: function (r) {
                r.appendChild(addPrompt(r, 'The moon lights the way out. Everything else in this room is switched off.'));
                const scene = cl('mz-scene');
                scene.appendChild(cl('mz-moon'));
                [0.28, 0.5, 0.72, 0.9].forEach(function (x) {
                    const st = cl('mz-star');
                    st.style.left = Math.round(x * 100) + '%'; st.style.top = '14px';
                    scene.appendChild(st);
                });
                const beam = cl('mz-beam');
                const door = cl('mz-door');
                const sun = h('button', {
                    class: 'mz-orn mz-sun mz-pulse', type: 'button',
                    'aria-label': 'ornamental sun in the scenery',
                    html: '<i class="fas fa-sun" aria-hidden="true"></i>'
                });
                scene.appendChild(beam); scene.appendChild(door); scene.appendChild(sun);
                r.appendChild(scene);
                const orb = h('button', { class: 'ml-orb', type: 'button', 'aria-label': 'the big exit orb' });
                on(orb, 'click', function () { if (!allow()) return; act(); miss('The obvious button is the obvious lie, and the light is not on it.'); });
                on(sun, 'click', function () { if (!allow()) return; act(); win(); });
                r.appendChild(cl('ml-row')).appendChild(orb);
                addNote(r, 'The light in this room lands on exactly one object.');
                function fit() {
                    if (!scene.isConnected) return;
                    const sr = sun.getBoundingClientRect(), cr = scene.getBoundingClientRect();
                    const mx = 36, my = 36;
                    sun.style.left = Math.round(Math.max(0, scene.clientWidth - 56) * 0.72) + 'px';
                    sun.style.top = Math.round(112 * (scene.clientHeight / 184)) + 'px';
                    const tr = sun.getBoundingClientRect();
                    const tx = tr.left + tr.width / 2 - cr.left, ty = tr.top + tr.height / 2 - cr.top;
                    beam.style.width = Math.round(Math.hypot(tx - mx, ty - my)) + 'px';
                    beam.style.transform = 'rotate(' + Math.round(Math.atan2(ty - my, tx - mx) * 180 / Math.PI) + 'deg)';
                }
                fit();
                on(window, 'resize', fit);
                cleanups.push(function () { window.removeEventListener('resize', fit); });
                solver = function () { sun.click(); };
            }
        },

        /* 03 --------------------------------- drag a word out of the rule */
        {
            name: 'Take It Out',
            goal: 'Drag the word that reverses the rule out of the sentence.',
            hint: 'The sentence is the room\'s rule. Pull the word that flips it out into the waste bin, then read the rule again.',
            why: 'Pulling \u201cnot\u201d out of the sentence turned a warning into an instruction, and the red button it then told you to press was live. In these rooms words are parts of the machine.',
            par: [34000, 2],
            build: function (r) {
                const f = addField(r, 132);
                const p = cl('ml-gtext');
                txt(p, 'You should not press the red button.');
                f.appendChild(p);
                const holder = cl('mz-holder');
                p.textContent = '';
                p.appendChild(document.createTextNode('You should '));
                p.appendChild(holder);
                p.appendChild(document.createTextNode(' press the red button.'));
                const chip = h('button', { class: 'mz-stub', type: 'button', text: 'not', 'aria-label': 'the word not \u2014 drag it out of the sentence' });
                f.appendChild(chip);
                const hr = holder.getBoundingClientRect(), fr = f.getBoundingClientRect();
                chip.style.left = Math.round(hr.left - fr.left) + 'px';
                chip.style.top = Math.round(hr.top - fr.top) + 'px';
                chip.style.minWidth = Math.max(56, Math.round(hr.width) + 10) + 'px';
                chip.__home = { left: chip.style.left, top: chip.style.top };
                const bin = makeBin('waste bin', 'fa-trash-can');
                r.appendChild(bin);
                let removed = false;
                zone(bin, { into: 'slot', accept: function () { return !removed; } });
                draggable(chip, {
                    name: 'not', tag: 'drag', pinned: true, into: 'slot',
                    wrong: 'It has to leave the sentence. Put it in the bin.',
                    onDeliver: function (z) {
                        if (z !== bin || removed) return;
                        removed = true;
                        M.sfx.good();
                        say('Read the sentence again: You should press the red button.');
                    }
                });
                const red = button('The red button', function () {
                    if (!removed) miss('Pressing that is exactly what the sentence warned you about.');
                    else win();
                }, 'ml-btn-hot');
                red.style.background = 'linear-gradient(100deg,#ef476f,#b0214a)';
                r.appendChild(red);
                addNote(r, 'One word in that sentence does not belong in it.');
                solver = function () {
                    if (!removed) simDrag(chip, bin);
                    red.click();
                };
            }
        },

        /* 04 ------------------------------------- move one thing to see */
        {
            name: 'Under The Rug',
            goal: 'Get the rug off the floor and type what it was covering.',
            hint: 'A rug is for covering. Drag it away, or just tap it and it will shuffle aside.',
            why: 'The code was printed on the floor under the rug. Sliding the rug aside uncovered CODE 48, and the number pad only ever wanted that.',
            par: [30000, 2],
            build: function (r) {
                r.appendChild(addPrompt(r, 'The rug is the only thing in this room you are allowed to move. Use it.'));
                const f = addField(r, 140);
                const cv = coverCtl(f, {
                    text: 'CODE 48', xp: 0.4, yp: 0.6, w: 132, h: 66, name: 'rug', tag: 'rug',
                    aria: 'the rug \u2014 drag it off the note, or tap it',
                    revealSay: 'The floor says: CODE 48'
                });
                const ans = answerCtl(r, {
                    digits: true, placeholder: 'the number on the floor', label: 'the number under the rug',
                    check: function (v) { return v === '48'; }, wrong: 'The floor is not showing that.'
                });
                addNote(r, 'Things that cover things can be moved.');
                solver = function () {
                    if (!cv.isSeen()) cv.slab.click();
                    ans.solve('48');
                };
            }
        },

        /* 05 --------------------------------- the wording is the interface */
        {
            name: 'Read The Line',
            goal: 'Tap the one live word in the instruction.',
            hint: 'Several words in that sentence are buttons. The right one names the thing you are reading.',
            why: 'Every word you could tap is scenery except the word that names what you are looking at: this instruction is an instruction, so that was the only live word.',
            par: [26000, 1],
            build: function (r) {
                const p = addPrompt(r, 'Every word in this instruction is decoration except one. Tap the word that names what an instruction is.');
                r.appendChild(p);
                const wc = wordsCtl(p, function (w) {
                    if (w === 'instruction') return 2;
                    return ['word', 'decoration', 'tap'].indexOf(w) >= 0 ? 1 : 0;
                }, function () { win(); });
                addNote(r, 'The answer is a word you can already see.');
                solver = function () { if (wc.goal) wc.goal.click(); };
            }
        },

        /* 06 ----------------------------------------- resize to reveal */
        {
            name: 'Fixed Panel',
            goal: 'Read the whole line, then pull the lever it points at.',
            hint: 'The panel is lying about being fixed \u2014 drag its bottom-right corner, or use the width slider, until the clipped end of the line shows.',
            why: 'The panel clipped the sentence; widening it revealed that lever two is the one with a wire behind it. \u201cCannot be resized\u201d was scenery talking.',
            par: [40000, 3],
            build: function (r) {
                r.appendChild(addPrompt(r, 'This panel is FIXED. It cannot be resized, and the line inside it is complete as it is.'));
                const f = addField(r, 150);
                const rz = resizerCtl(f, {
                    text: 'PULL LEVER TWO - ONE IS PAINT', start: 148,
                    onOpen: function () { say('The whole line reads: PULL LEVER TWO - ONE IS PAINT'); }
                });
                const one = h('button', { class: 'mz-stub', type: 'button', style: 'flex:1 1 0', text: 'Lever one', 'aria-label': 'lever one' });
                on(one, 'click', function () { if (!allow()) return; act(); miss('Lever one is bolted to nothing but the wall.'); });
                const two = h('button', { class: 'mz-stub', type: 'button', style: 'flex:1 1 0', text: 'Lever two', 'aria-label': 'lever two' });
                on(two, 'click', function () {
                    if (!allow()) return;
                    act();
                    if (rz.isOpen()) win();
                    else miss('Read the whole line first.');
                });
                const row = cl('ml-row'); row.appendChild(one); row.appendChild(two); r.appendChild(row);
                addNote(r, 'Look for a corner you can pull.');
                solver = function () {
                    if (!rz.isOpen()) rz.dragOpen();
                    two.click();
                };
            }
        },

        /* 07 ---------------------------------- combining clues, first half */
        {
            name: 'Both Corners',
            goal: 'Wake both plaques, then type the word they make.',
            hint: 'Tap the plaque in each corner, then type the two letters in the order the shelf label shows.',
            why: 'Neither plaque was an answer on its own. Waking both gave G and O, and the shelf decided the order, so the word the room wanted was GO.',
            par: [32000, 3],
            build: function (r) {
                r.appendChild(addPrompt(r, 'Each corner of this room knows half of a word. The shelf says which half comes first.'));
                const f = addField(r, 140);
                const shelf = cl('ml-count');
                txt(shelf, 'shelf order: 1 top left \u00b7 2 bottom right');
                r.appendChild(shelf);
                const got = [false, false];
                function plaque(i, side, letter) {
                    const b = h('button', { class: 'mz-orn', type: 'button', 'aria-label': 'the plaque in the ' + side + ' corner' });
                    txt(b, (i + 1) + ' ?');
                    b.style.position = 'absolute'; b.style.top = i === 0 ? '6px' : '78px';
                    if (side === 'left') b.style.left = '3%'; else b.style.right = '3%';
                    on(b, 'click', function () {
                        if (!allow() || got[i]) return;
                        got[i] = true; act();
                        b.classList.add('is-lit'); txt(b, (i + 1) + ' ' + letter);
                        M.sfx.good(); say('Collected ' + letter + ' from the ' + side + ' corner.');
                    });
                    f.appendChild(b);
                    return b;
                }
                const a = plaque(0, 'left', 'G');
                const b = plaque(1, 'right', 'O');
                const ans = answerCtl(r, {
                    placeholder: 'the two letter word', label: 'the word from both corners',
                    check: function (v) { return got[0] && got[1] && v === 'go'; },
                    wrong: 'Those are not the two letters the corners gave.'
                });
                addNote(r, 'Both plaques have to be awake before either means anything.');
                solver = function () { a.click(); b.click(); ans.solve('go'); };
            }
        },

        /* 08 -------------------------------------- repeated unexpected taps */
        {
            name: 'Four Corners',
            goal: 'Give the ornament as many taps as the room has corners.',
            hint: 'Count the rivets in the strip of dots, then tap the sun ornament exactly that many times.',
            why: 'The row of four corner rivets was the number the room was built around, and the only thing willing to take four taps was the ornament that looked like decoration.',
            par: [26000, 4],
            build: function (r) {
                r.appendChild(addPrompt(r, 'Give the ornament in this room the same number of taps as this room has corners.'));
                const dots = cl('mz-dots');
                const tally = cl('ml-count');
                [1, 2, 3, 4].forEach(function () { dots.appendChild(h('i', { 'aria-hidden': 'true' })); });
                r.appendChild(dots);
                if (sgn()) { txt(tally, 'four corners, four taps'); r.appendChild(tally); }
                const sun = h('button', { class: 'mz-orn mz-sun', type: 'button', 'aria-label': 'the sun ornament \u2014 tap it' });
                sun.appendChild(h('i', { class: 'fas fa-sun', 'aria-hidden': 'true' }));
                r.appendChild(sun);
                let n = 0;
                on(sun, 'click', function () {
                    if (!allow()) return;
                    n++; act(); M.sfx.tick();
                    if (sgn()) txt(tally, 'the sun has had ' + n + ' of 4');
                    if (n >= 4) win();
                    else if (n === 1) say('It gave a little. Keep going.');
                });
                addNote(r, 'The room shows you how many corners it has.');
                solver = function () { for (let i = 0; i < 4; i++) sun.click(); };
            }
        },

        /* 09 ----------------------------- rearrange to expose the pattern */
        {
            name: 'Straighten The Wall',
            goal: 'Put the tiles back in the wall\'s colour order and read them.',
            hint: 'The colour strip is the wall\'s own order. Drag each tile into the numbered slot that matches its colour.',
            why: 'Each tile carried one letter, and the wall\'s colour sequence W-O-R-K put them in the right order \u2014 lined up by colour the row read WORK, which is what the room was asking for.',
            par: [52000, 5],
            build: function (r) {
                r.appendChild(addPrompt(r, 'These four came off the wall out of order. Put them back the way the pattern wants \u2014 the wall reads left to right.'));
                const tiles = [
                    { id: 'W', c: '#eef1ff' }, { id: 'O', c: '#06d6a0' },
                    { id: 'R', c: '#ef476f' }, { id: 'K', c: '#4cc9f0' }
                ];
                const order = ['W', 'O', 'R', 'K'];
                const strip = cl('mz-strip');
                order.forEach(function (id) {
                    const t = tiles.filter(function (x) { return x.id === id; })[0];
                    strip.appendChild(h('i', { 'aria-hidden': 'true', style: 'background:' + t.c }));
                });
                r.appendChild(strip);
                const f = addField(r, 176);
                const slotsRow = cl('ml-slots');
                slotsRow.style.position = 'absolute'; slotsRow.style.left = '0'; slotsRow.style.bottom = '0';
                const slots = order.map(function (_, i) {
                    const s = h('button', { class: 'ml-slot mz-slot', type: 'button', 'aria-label': 'wall position ' + (i + 1) });
                    s.appendChild(h('b', { text: String(i + 1), 'aria-hidden': 'true' }));
                    const holder = cl('mz-holder mz-slotcell');
                    s.appendChild(holder);
                    zone(holder.parentNode, {});
                    s.__cell = holder;
                    s.__dropOpt.accept = function (el) {
                        if (s.__val) { miss('Position ' + (i + 1) + ' is already filled.'); return false; }
                        return true;
                    };
                    s.__dropOpt.onArrive = function (el) {
                        s.__val = el.__val;
                        while (el.firstChild) holder.appendChild(el.firstChild);
                        el.style.display = 'none';
                    };
                    slotsRow.appendChild(s);
                    return s;
                });
                f.appendChild(slotsRow);
                const spots = [[0.03, 0.02], [0.28, 0.06], [0.53, 0.01], [0.76, 0.07]];
                const els = {};
                tiles.forEach(function (t, i) {
                    const b = h('button', { class: 'mz-stub', type: 'button', style: 'padding:4px', 'aria-label': 'tile ' + t.id });
                    b.appendChild(h('span', { class: 'mz-tile', style: '--c:' + t.c, text: t.id }));
                    f.appendChild(b);
                    placeAt(b, f, spots[i][0], spots[i][1]);
                    draggable(b, { name: 'tile ' + t.id, tag: 'drag', pinned: true });
                    b.__val = t.id;
                    els[t.id] = b;
                });
                const go = button('Read the wall', function () {
                    const word = slots.map(function (s) { return s.__val || ''; }).join('');
                    if (word === 'WORK') { M.sfx.good(); win(); }
                    else miss('That order reads ' + (word || 'nothing') + '. Make the colours run the way the strip does.');
                }, 'ml-btn-hot');
                r.appendChild(go);
                addNote(r, 'Drag a tile into a numbered slot, or tap the tile then the slot.');
                solver = function () {
                    order.forEach(function (id, i) {
                        if (!slots[i].__val) simDragTile(els[id], slots[i].__cell);
                    });
                    go.click();
                };
            }
        },

        /* 10 ---------------------------------------- the wording holds the key */
        {
            name: 'The Real Instruction',
            goal: 'Open the door the four lines actually name.',
            hint: 'Read only the first letter of each of the four lines, top to bottom, and press the door that word names.',
            why: 'The first letters of the four lines spell LEFT, so the left-hand door was the one that opened. The room\'s real instruction was hidden in the shape of the wording rather than its meaning.',
            par: [40000, 1],
            build: function (r) {
                r.appendChild(addPrompt(r, 'Four lines follow. Only their first letters mean anything. Press the door one of them names.'));
                const body = cl('mz-body');
                ['Leave the way you came', 'Every second face is a wall', 'Find the smaller half', 'Turn back when the light goes']
                    .forEach(function (t) { addLine(body, t); });
                r.appendChild(body);
                const doors = doorRow(r, {
                    opts: ['LEFT', 'RIGHT', 'FRONT'], right: 'LEFT', kind: 'door',
                    wrong: function (l) { return 'The ' + l.toLowerCase() + ' door is a cupboard.'; }
                });
                addNote(r, 'Read down the left edge of those four lines.');
                solver = function () { doors.buttons.LEFT.click(); };
            }
        },

        /* 11 ----------------------------------------- rotate to read it */
        {
            name: 'Read The Sign',
            goal: 'Turn the sign until it is right, then type the small number.',
            hint: 'The dial turns the sign. Give it a half circle and the line printed under the big number becomes legible.',
            why: 'The fine print was set upside down on purpose, so the sign had to be turned a half circle before 14 could be read \u2014 and the big 9 was a 6 all along.',
            par: [42000, 2],
            build: function (r) {
                r.appendChild(addPrompt(r, 'This sign says NINE and the sign is wrong. Turn it until it is right, then type the small number printed under the big one.'));
                const pl = plateCtl(r, {
                    big: '9', fine: 'FINE PRINT 14', at: 180,
                    onAt: function () { say('Now read the small line under the number.'); }
                });
                const ans = answerCtl(r, {
                    digits: true, placeholder: 'the small number', label: 'the fine print number',
                    check: function (v) { return v === '14' && pl.plate.__done === true; },
                    wrong: 'That is not what the fine print says.'
                });
                addNote(r, 'The dial is under the sign.');
                solver = function () {
                    if (!pl.plate.__done) pl.dial.__set(180);
                    ans.solve('14');
                };
            }
        },

        /* 12 ------------------------------------- the nothing is the button */
        {
            name: 'Nothing Here',
            goal: 'Do what the sentence says: tap the nothing.',
            hint: 'The dashed empty box is the only nothing in the room. The orb is a something.',
            why: 'The room said there was nothing to press and it was almost true \u2014 the empty dashed box is not a thing, and the nothing was the control. The orb was a something, so it was the lie.',
            par: [28000, 1],
            build: function (r) {
                r.appendChild(addPrompt(r, 'There is nothing in this room worth pressing. Tap the nothing.'));
                const box = h('button', { class: 'ml-drop mz-empt', type: 'button', 'aria-label': 'the empty nothing in the room \u2014 tap it' });
                box.appendChild(h('i', { class: 'fas fa-ban', 'aria-hidden': 'true' }));
                box.appendChild(h('span', { class: 'ml-count', text: 'nothing here' }));
                const orb = h('button', { class: 'ml-orb', type: 'button', 'aria-label': 'the orb' });
                on(orb, 'click', function () { if (!allow()) return; act(); miss('That is a something.'); });
                on(box, 'click', function () { if (!allow()) return; act(); win(); });
                const row = cl('ml-row'); row.appendChild(orb);
                r.appendChild(box); r.appendChild(row);
                addNote(r, 'An empty placeholder is still a thing you can press.');
                solver = function () { box.click(); };
            }
        },

        /* 13 --------------------------------- drag the labels where they fit */
        {
            name: 'Wrong Labels',
            goal: 'Drag each label onto the object it describes.',
            hint: 'Drag HOT onto the fire, COLD onto the ice and DARK onto the moon \u2014 or tap a label then tap its object.',
            why: 'The labels were stuck where they did not belong. Matching fire to HOT, ice to COLD and moon to DARK woke all three plates at once, which is all the room ever wanted.',
            par: [46000, 3],
            build: function (r) {
                r.appendChild(addPrompt(r, 'Every label in this room is stuck on the wrong thing. Put each one where it belongs.'));
                const f = addField(r, 164);
                const objs = {};
                let placed = 0;
                [['HOT', 'fa-fire', 'fire'], ['COLD', 'fa-snowflake', 'ice'], ['DARK', 'fa-moon', 'moon']].forEach(function (o, i) {
                    const b = h('button', { class: 'mz-stub mz-obj', type: 'button', 'aria-label': 'the object that is ' + o[2] });
                    b.appendChild(h('i', { class: 'fas ' + o[1], 'aria-hidden': 'true' }));
                    b.style.position = 'absolute';
                    b.style.left = Math.round((i + 0.5) * Math.max(180, f.clientWidth) / 3 - 28) + 'px';
                    b.style.top = '104px';
                    zone(b, {
                        accept: function (el) {
                            if (el.__dragOpt.name !== o[0]) { miss('That object is not ' + el.__dragOpt.name + '.'); return false; }
                            if (b.__taken) { miss('That object already has its label.'); return false; }
                            return true;
                        },
                        onArrive: function () {
                            b.__taken = true; b.classList.add('is-seen');
                            placed++; M.sfx.good();
                            if (placed >= 3) { say('Every label is on the thing it describes.'); win(); }
                            else say(placed + ' of 3 labels are home.');
                        }
                    });
                    f.appendChild(b); objs[o[0]] = b;
                });
                const spots = [[0.06, 0.04], [0.42, 0.08], [0.74, 0.02]];
                const els = {};
                ['COLD', 'DARK', 'HOT'].forEach(function (w, i) {
                    els[w] = makePiece(w, spots[i][0], spots[i][1], f, {
                        name: w, tag: 'drag', wrong: 'That is not where that label goes.'
                    });
                    els[w].__dragOpt.into = 'slot';
                    els[w].__dragOpt.onDeliver = function (z) { if (z !== objs[w]) z.classList.remove('is-over'); };
                });
                addNote(r, 'The objects are drop targets too.');
                solver = function () {
                    ['HOT', 'COLD', 'DARK'].forEach(function (w) {
                        if (!objs[w].__taken) simDrag(els[w], objs[w]);
                    });
                };
            }
        },

        /* 14 -------------------------- combine two hides, two different ways */
        {
            name: 'Two Ways To Hide',
            goal: 'Uncover both digits, then dial the number they make.',
            hint: 'Widen the left panel for the first digit and turn the right plate a half circle for the second, then dial forty-two.',
            why: 'The first digit was clipped behind a panel that claimed it could not be resized, the second was printed upside down on a plate. Both had to be uncovered before the dial could be set to 42.',
            par: [52000, 3],
            build: function (r) {
                r.appendChild(addPrompt(r, 'This room hides a two digit number, one digit at a time, in two different ways. Then dial it.'));
                let a = false, b = false;
                const leftBox = cl('mz-body');
                r.appendChild(leftBox);
                const rz = resizerCtl(leftBox, { text: 'FIRST DIGIT IS FOUR', start: 134, onOpen: function () { a = true; say('First digit: 4'); } });
                const rightBox = cl('mz-body');
                r.appendChild(rightBox);
                const pl = plateCtl(rightBox, { big: '6', fine: 'SECOND DIGIT IS TWO', at: 180, onAt: function () { b = true; say('Second digit: 2'); } });
                const read = cl('mz-dialv');
                txt(read, '10');
                const dial = slider({
                    min: 10, max: 99, value: 10, label: 'the two digit number',
                    onValue: function (v) {
                        txt(read, String(v));
                        if (!a || !b) { say('Uncover both digits first.'); return; }
                        if (v === 42) win();
                    }
                });
                const row = cl('ml-row'); row.appendChild(read);
                r.appendChild(row); r.appendChild(dial);
                addNote(r, 'One hide is a size, the other is an angle.');
                solver = function () {
                    if (!a) rz.dragOpen();
                    if (!b) pl.dial.__set(180);
                    dial.__set(42);
                };
            }
        },

        /* 15 --------------------------------------- throw it in the bin */
        {
            name: 'Throw It Out',
            goal: 'Get rid of the rubbish, then dial what it said.',
            hint: 'Drag the rubbish into the bin, or tap it and it hops in, then dial the number that floats up.',
            why: 'The number was printed on the inside of the rubbish and only became readable once the rubbish was gone. The bin was the only thing in here that wanted anything.',
            par: [36000, 2],
            build: function (r) {
                r.appendChild(addPrompt(r, 'This room has one piece of rubbish in it and the rubbish is hiding something. Get rid of it.'));
                const f = addField(r, 124);
                const crumple = h('button', { class: 'mz-stub', type: 'button', 'aria-label': 'a piece of rubbish \u2014 get rid of it' });
                crumple.appendChild(h('i', { class: 'fas fa-trash', 'aria-hidden': 'true' }));
                f.appendChild(crumple);
                const bin = makeBin('bin', 'fa-recycle');
                r.appendChild(bin);
                let gone = false;
                zone(bin, { into: 'slot', accept: function () { return !gone; } });
                const reveal = cl('ml-hidden-note');
                r.appendChild(reveal);
                function goneNow() {
                    if (gone) return;
                    gone = true; M.sfx.good();
                    txt(reveal, 'the rubbish said: 13');
                    say('The rubbish read 13. Put that on the dial.');
                }
                bin.__dropOpt.onArrive = goneNow;
                draggable(crumple, {
                    name: 'rubbish', tag: 'drag', into: 'slot',
                    wrong: 'In the bin, not on the floor.',
                    onDeliver: function (z) { if (z === bin) goneNow(); },
                    onTap: function (el) { piecePos(el, el.__field.clientWidth - el.offsetWidth - 4, 6, el.__field); goneNow(); }
                });
                const read = cl('mz-dialv');
                txt(read, '0');
                const dial = slider({
                    min: 0, max: 20, value: 0, label: 'the dial, nought to twenty',
                    onValue: function (v) {
                        txt(read, String(v));
                        if (!gone) { say('Dialling it does nothing while the rubbish is still on the floor.'); return; }
                        if (v === 13) win();
                    }
                });
                r.appendChild(dial);
                addNote(r, 'Rubbish belongs in a bin.');
                solver = function () {
                    if (!gone) simDrag(crumple, bin);
                    dial.__set(13);
                };
            }
        },

        /* 16 --------------------------- drag a word into the rule's blank */
        {
            name: 'The Missing Word',
            goal: 'Make the rule true, then follow it.',
            hint: 'Only one of the two loose words makes the rule true. Drag it into the blank, then press the door the completed rule names.',
            why: 'The blank decided which door opened. With FIRST the rule pointed at a painted door; with SECOND the rule became true, and the second door is the one with hinges on it.',
            par: [44000, 2],
            build: function (r) {
                r.appendChild(addPrompt(r, 'The rule in this room has a word missing, and two words are loose. Complete the rule, then obey it.'));
                const f = addField(r, 132);
                const p = cl('ml-gtext');
                f.appendChild(p);
                const g = h('button', { class: 'mz-gap', type: 'button', 'aria-label': 'the blank in the rule' });
                p.appendChild(document.createTextNode('The '));
                p.appendChild(g);
                p.appendChild(document.createTextNode(' door opens. Nothing else in here does.'));
                zone(g, {});
                let word = null;
                const chips = {};
                [['FIRST', 0.05, 0.62], ['SECOND', 0.5, 0.64]].forEach(function (c) {
                    const b = h('button', { class: 'mz-stub', type: 'button', text: c[0], 'aria-label': 'the word ' + c[0] + ' \u2014 drag it into the blank' });
                    f.appendChild(b);
                    placeAt(b, f, c[1], c[2]);
                    draggable(b, {
                        name: c[0], tag: 'drag', pinned: true, into: 'slot',
                        wrong: 'That is not the blank.',
                        onDeliver: function (z) {
                            if (z !== g) return;
                            word = c[0];
                            g.classList.add('is-filled');
                            M.sfx.good();
                            say('The rule now reads: The ' + c[0] + ' door opens.');
                        }
                    });
                    chips[c[0]] = b;
                });
                const doors = doorRow(r, {
                    opts: ['FIRST DOOR', 'SECOND DOOR'], right: 'SECOND DOOR', kind: 'door',
                    wrong: function (l) {
                        if (word !== 'SECOND') return 'The rule does not say that yet.';
                        return 'The ' + l.toLowerCase() + ' is painted on.';
                    }
                });
                addNote(r, 'The blank is a socket and one of those words fits it.');
                solver = function () {
                    if (word !== 'SECOND') simDrag(chips.SECOND, g);
                    doors.buttons['SECOND DOOR'].click();
                };
            }
        },

        /* 17 ------------------------------ two states in a fixed order */
        {
            name: 'Switch Off The Lights',
            goal: 'Dark first, then light, then the ornament.',
            hint: 'Switch the lamp off so the wall can be read, switch it back on, then press what the message tells you to.',
            why: 'The message was written in ink that only shows in the dark, and the lamp is a real control. Once it was readable it said TAP THE SUN WHEN THE LIGHT IS ON, so the lamp had to come back up before the ornament would do anything.',
            par: [50000, 3],
            build: function (r) {
                r.appendChild(addPrompt(r, 'The wall says something. You cannot read it while the lights are on.'));
                const head = cl('ml-row');
                const sw = h('button', { class: 'mz-switch', type: 'button', role: 'switch', 'aria-checked': 'true', 'aria-label': 'the room lamp' });
                sw.appendChild(h('i', { 'aria-hidden': 'true' }));
                const lampTxt = cl('mz-lampline');
                const lampDot = cl('mz-lamp is-on');
                lampTxt.appendChild(lampDot);
                const lampWord = document.createTextNode('lamp on');
                lampTxt.appendChild(lampWord);
                head.appendChild(sw); head.appendChild(lampTxt);
                r.appendChild(head);
                const msg = cl('ml-gtext mz-uv');
                txt(msg, 'TAP THE SUN WHEN THE LIGHT IS ON');
                r.appendChild(msg);
                const f = addField(r, 128);
                const sun = h('button', { class: 'mz-orn', type: 'button', 'aria-label': 'the sun ornament on the wall' });
                sun.appendChild(h('i', { class: 'fas fa-sun', 'aria-hidden': 'true' }));
                sun.style.position = 'absolute'; sun.style.right = '6%'; sun.style.top = '44px';
                f.appendChild(sun);
                let lit = true, state = 0;
                function setLamp(v) {
                    lit = v;
                    sw.setAttribute('aria-checked', v ? 'true' : 'false');
                    r.classList.toggle('mz-lightsout', !v);
                    msg.classList.toggle('mz-lit', !v);
                    msg.classList.toggle('mz-uv', v);
                    lampWord.textContent = v ? 'lamp on' : 'lamp off';
                    lampDot.classList.toggle('is-on', v);
                }
                on(sw, 'click', function () {
                    if (!allow()) return;
                    act(); setLamp(!lit);
                    if (!lit && state === 0) { state = 1; say('Now the wall can be read.'); }
                    else if (lit && state === 1) { state = 2; say('The light is on. The wall said what to do in it.'); }
                    else if (lit) say('Still unreadable.');
                });
                on(sun, 'click', function () {
                    if (!allow()) return;
                    act();
                    if (state === 2) win();
                    else if (!lit) miss('The wall says to do that while the light is on.');
                    else miss('You have not read the wall yet.');
                });
                addNote(r, 'Two switchings, one order: dark first, then light.');
                solver = function () {
                    if (state < 1) sw.click();
                    if (state < 2) sw.click();
                    sun.click();
                };
            }
        },

        /* 18 ------------------- three halves from three different tricks */
        {
            name: 'Three Corners',
            goal: 'Collect the three letters and type the word.',
            hint: 'Tap the plaque, slide the cover off the wall and run the long slider to the end of its track. Each one hands over a numbered letter.',
            why: 'ONE was a tap in the top left and TWO was under a cover at the bottom, but THREE only surfaces when the slider reaches the end of its track \u2014 the same mechanic twice, which is how you know which one was the fake. In number order the letters spell ONE.',
            par: [56000, 4],
            build: function (r) {
                r.appendChild(addPrompt(r, 'This room holds three letters, each hidden a different way, each numbered. Collect all three and type the word they make in number order.'));
                const f = addField(r, 160);
                const got = {};
                function collect(letter, n) {
                    if (got[n]) return;
                    got[n] = letter; M.sfx.good();
                    say('Letter ' + n + ': ' + letter);
                }
                const plaque = h('button', { class: 'mz-orn', type: 'button', 'aria-label': 'plaque ONE in the top left corner' });
                txt(plaque, '1 ?');
                plaque.style.position = 'absolute'; plaque.style.left = '3%'; plaque.style.top = '6px';
                on(plaque, 'click', function () {
                    if (!allow() || got[1]) return;
                    act(); txt(plaque, '1 O'); plaque.classList.add('is-lit'); collect('O', 1);
                });
                f.appendChild(plaque);
                const cv = coverCtl(f, {
                    text: '2 N', xp: 0.4, yp: 0.62, w: 122, h: 56, name: 'cover', tag: 'slide',
                    aria: 'the cover on the wall \u2014 drag it aside or tap it', revealSay: 'Under the cover: 2 N',
                    onSee: function () { collect('N', 2); }
                });
                const end = cl('mz-under');
                txt(end, 'at the end of the track: 3 ?');
                r.appendChild(end);
                let three = false;
                const sld = slider({
                    min: 0, max: 100, value: 0, label: 'the long slider',
                    onValue: function (v) {
                        if (v >= 100 && !three) { three = true; end.classList.add('is-seen'); txt(end, 'at the end of the track: 3 E'); collect('E', 3); }
                    }
                });
                r.appendChild(sld);
                const ans = answerCtl(r, {
                    placeholder: 'the three letter word', label: 'the word from all three letters',
                    check: function (v) { return got[1] && got[2] && got[3] && v === 'one'; },
                    wrong: 'That is not what those three letters make.'
                });
                addNote(r, 'One letter is a tap, one is a slide, one is a track.');
                solver = function () {
                    if (!got[1]) plaque.click();
                    if (!cv.isSeen()) cv.slab.click();
                    if (!three) sld.__set(100);
                    ans.solve('one');
                };
            }
        },

        /* 19 ------------------------- three mechanics, one arithmetic */
        {
            name: 'Everything At Once',
            goal: 'Find A and B, then dial A times B.',
            hint: 'Slide the cover off the floor for A, widen the clipped panel for B, then set the dial to their product and check it.',
            why: 'The room finally asked for arithmetic between two hides: the floor said A = 7 and the panel that could not be resized said B = 6, so the dial wanted 42.',
            par: [62000, 4],
            build: function (r) {
                r.appendChild(addPrompt(r, 'Two numbers are hidden in here in two different ways. The dial wants their product: A times B.'));
                const f = addField(r, 150);
                const cv = coverCtl(f, {
                    text: 'A = 7', xp: 0.06, yp: 0.6, w: 122, h: 58, name: 'rug', tag: 'rug',
                    aria: 'the rug \u2014 drag it off or tap it', revealSay: 'A = 7'
                });
                const box = cl('mz-body');
                r.appendChild(box);
                const rz = resizerCtl(box, { text: 'B = 6, THE SECOND NUMBER', start: 130, onOpen: function () { say('B = 6'); } });
                const read = cl('mz-dialv');
                txt(read, '0');
                const dial = slider({
                    min: 0, max: 90, value: 0, label: 'the product of A and B',
                    onValue: function (v) { txt(read, String(v)); }
                });
                const row = cl('ml-row'); row.appendChild(read);
                r.appendChild(row); r.appendChild(dial);
                const go = button('Check the dial', function () {
                    if (!cv.isSeen() || !rz.isOpen()) { miss('You have not uncovered both numbers yet.'); return; }
                    if (Number(dial.value) === 42) { M.sfx.good(); win(); }
                    else miss(dial.value + ' is not A times B.');
                }, 'ml-btn-hot');
                r.appendChild(go);
                addNote(r, 'One hide is under a rug, one is behind a size.');
                solver = function () {
                    if (!cv.isSeen()) cv.slab.click();
                    if (!rz.isOpen()) rz.dragOpen();
                    dial.__set(42);
                    go.click();
                };
            }
        },

        /* 20 ------------------------------------------------- the finale */
        {
            name: 'Give Up',
            goal: 'Nothing works here. Give it power anyway.',
            hint: 'Take the word that means stop out of GIVE UP and put it on the power switch, then read what the sign becomes and press the door it names.',
            why: 'The room signed out two instructions at once. Pulling UP out of GIVE UP turned it into GIVE, so the loose word was what fitted the power switch; once the current was on, the sign that said NOTHING WORKS lit up as SIX, and the only door was the one that word named.',
            par: [60000, 2],
            build: function (r) {
                const f = addField(r, 130);
                const p = cl('ml-gtext');
                txt(p, 'NOTHING WORKS HERE. GIVE UP.');
                f.appendChild(p);
                const sign = cl('ml-gtext mz-uv');
                txt(sign, 'Nada');
                const sw = h('button', { class: 'mz-switch', type: 'button', role: 'switch', 'aria-checked': 'false', 'aria-label': 'the power switch' });
                sw.appendChild(h('i', { 'aria-hidden': 'true' }));
                const label = cl('ml-count');
                txt(label, 'power off');
                let powered = false, chip = null;
                zone(sw, {
                    accept: function (el) {
                        if (!el.__dragOpt || el.__dragOpt.name !== 'up') { miss('That word is not for the switch.'); return false; }
                        return !powered;
                    },
                    onArrive: function () {
                        if (powered) return;
                        powered = true;
                        sw.setAttribute('aria-checked', 'true');
                        txt(label, 'power on');
                        sign.classList.remove('mz-uv');
                        txt(sign, 'SIX');
                        M.sfx.good();
                        say('The sign is lit: SIX. Press the door it names.');
                    }
                });
                const wc = wordsCtl(p, function (w) {
                    if (w === 'up') return 3;
                    return ['nothing', 'works', 'here'].indexOf(w) >= 0 ? 1 : 0;
                }, function (word, clean, b) {
                    chip = b;
                    b.setAttribute('aria-label', 'the word up \u2014 drag it onto the power switch');
                    b.classList.add('ml-drag', 'mz-piece', 'mz-inflow');
                    const fr = f.getBoundingClientRect(), er = b.getBoundingClientRect();
                    b.style.left = Math.round(er.left - fr.left) + 'px';
                    b.style.top = Math.round(er.top - fr.top) + 'px';
                    b.__home = { left: b.style.left, top: b.style.top };
                    draggable(b, {
                        name: 'up', tag: 'drag', pinned: true,
                        wrong: 'That word is not for the wall.',
                        onDeliver: function (z) { if (z === sw) txt(p, 'NOTHING WORKS HERE. GIVE.'); }
                    });
                    say('Now put that word somewhere useful.');
                });
                r.appendChild(sign); r.appendChild(sw); r.appendChild(label);
                const doors = doorRow(r, {
                    opts: ['ONE', 'SIX', 'TEN'], right: 'SIX', kind: 'door',
                    wrong: function (l) {
                        if (!powered) return 'Nothing works here \u2014 the sign is not even lit.';
                        return 'The sign does not say ' + l.toLowerCase() + '.';
                    }
                });
                addNote(r, 'GIVE UP is two instructions and only one of them is true.');
                solver = function () {
                    if (!chip && wc.goal) wc.goal.click();
                    if (!powered && chip) simDrag(chip, sw);
                    if (powered && allow()) doors.buttons.SIX.click();
                };
            }
        }
    ];

    /* Tiles that have to land in a numbered slot go into the slot's own holder,
       so the drag still uses the real pointer path. */
    function simDragTile(el, cell) {
        simDrag(el, cell);
    }

    /* ------------------------------------------------------------- render one */
    function play(i) {
        const idx = Math.max(0, Math.min(LEVELS.length - 1, i | 0));
        const L = LEVELS[idx];
        cleanups.forEach(function (fn) { try { fn(); } catch (e) {} });
        cleanups = [];
        solver = null; picked = null; overZone = null; lastUp = 0;
        api.setLevel(idx, L.name, LEVELS.length);
        const p = parFor(L.par[0], L.par[1]);
        api.setPar(p[0], p[1]);
        api.setHint(L.hint);
        api.explain(L.why);
        api.host.replaceChildren();
        log[idx] = { name: L.name, trick: L.why, out: 'open' };
        const room = makeRoom();
        solver = null;
        L.build(room);
        if (!solver) solver = function () {};
        api.say(L.goal);
    }

    /* --------------------------------------------------------------- review */
    function review() {
        const rows = [];
        log.forEach(function (l, n) {
            if (!l) return;
            const mark = l.out === 'right' ? 'fa-circle-check' : 'fa-circle-xmark';
            const word = l.out === 'right' ? 'Cracked' : 'Not cracked';
            rows.push(h('div', { class: 'ml-review-row' }, [
                h('p', {
                    class: 'ml-review-q',
                    html: '<i class="fas ' + mark + '" aria-hidden="true"></i> Room ' + (n + 1) + ' \u00b7 ' + M.esc(l.name) + ' \u2014 ' + word
                }),
                h('p', { class: 'ml-fine', text: l.trick })
            ]));
        });
        if (!rows.length) return [];
        return [h('div', { class: 'ml-review' }, [
            h('h4', { class: 'ml-review-title', text: 'Every room you were handed, and what the trick was' })
        ].concat(rows))];
    }

    /* ---------------------------------------------------------- registration */
    M.register('glitch', {
        rules: function () {
            return [
                'Twenty trick rooms. The obvious reading is the trap.',
                'Real controls: buttons, switches, sliders and word chips you can move.',
                'Scenery is scenery, except when it is the only thing in the room that works.',
                'Drag it, or tap a piece and then tap where it goes. Arrow keys work too.',
                'Every room explains itself once you have cracked it.',
                'Solve for 100 x difficulty plus par bonuses. Wrong 5, hint 25, skip 20.',
                'Three hints a run. Restart puts the room back exactly as you found it.',
                'Hard drops the tags and the lit targets, and cuts par time to about two thirds.',
                'Co-op and versus both happen on this one device. No online play of any kind.'
            ];
        },
        start: function (a) {
            api = a; log = [];
            a.onReset(play);
            play(0);
        },
        next: function (a) {
            if (a.level + 1 >= LEVELS.length) { a.finish(); return; }
            play(a.level + 1);
        },
        solve: function () { if (solver) solver(); },
        review: review
    });
})();
