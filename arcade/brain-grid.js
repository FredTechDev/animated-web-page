/* ==========================================================================
   BRAIN GRID — thirty-two authored puzzles, eight to a run.
   Every puzzle here is written by hand with one verified answer and a real
   explanation. Nothing is generated at play time; only the order of the options
   is shuffled, and it is shuffled once per run so two players on the same device
   are handed the identical question.
   Browser only: no network, no dependencies, no build step.
   ========================================================================== */
(function () {
    'use strict';
    const M = window.MindLab;
    if (!M) return;

    const h = M.h, esc = M.esc;

    /* kinds: choice | number | cells | gridmap | arrange */
    const PUZZLES = [
        /* ---------------------------------------------------------------- EASY */
        {
            d: 'Easy', kind: 'choice', cat: 'Number sequences', time: 45,
            q: '2, 4, 8, 16, ?', opts: ['20', '24', '32', '34'], ans: '32',
            hint: 'Divide each number by the one before it.',
            why: 'Each term is double the one before it, so 16 becomes 32.'
        },
        {
            d: 'Easy', kind: 'choice', cat: 'Odd one out', time: 45,
            q: 'Which one does not belong?', opts: ['9', '16', '25', '30'], ans: '30',
            hint: 'Three of them are a number multiplied by itself.',
            why: '9, 16 and 25 are perfect squares (3², 4², 5²). 30 is not a square of anything whole.'
        },
        {
            d: 'Easy', kind: 'number', cat: 'Missing number', time: 45,
            q: '3 → 9    5 → 15    7 → ?', unit: 'the missing number', ans: 21,
            hint: 'Ask what turns 3 into 9.',
            why: 'Each pair multiplies by 3, so 7 × 3 = 21.'
        },
        {
            d: 'Easy', kind: 'choice', cat: 'Pattern recognition', time: 45,
            q: '▲ ▲ ● ▲ ▲ ● ▲ ▲ ?', opts: ['▲', '▲ ▲', '●', '● ●'], ans: '●',
            hint: 'Group the symbols into blocks of three.',
            why: 'The block ▲ ▲ ● repeats. After ▲ ▲ the next symbol is ●.'
        },
        {
            d: 'Easy', kind: 'number', cat: 'Symbol substitution', time: 45,
            q: 'If ● = 3 and ■ = 5, what is ● + ■ + (● × ■) ?', unit: 'the value', ans: 23,
            hint: 'Do the multiplication before the additions.',
            why: '● × ■ is 15, and 3 + 5 + 15 = 23. Multiplication comes first.'
        },
        {
            d: 'Easy', kind: 'choice', cat: 'Rule-based logic', time: 45,
            q: 'The box holds moons and coins. Every moon in the box is round. Some round things in the box are coins. Which statement MUST be true?',
            opts: ['Every coin is a moon', 'Some round things in the box are moons', 'No coin is a moon', 'Every moon is a coin'],
            ans: 'Some round things in the box are moons',
            hint: 'Ask what the moons guarantee, not what the coins might do.',
            why: 'The moons are all round and there are moons, so the round pile certainly contains them. Nothing about coins follows from the two statements.'
        },
        {
            d: 'Easy', kind: 'arrange', cat: 'Spatial arrangement', time: 45, par: 4,
            q: 'Order these fractions from smallest to largest.',
            tiles: ['¼', '⅓', '½', '⅖'], ans: ['¼', '⅓', '⅖', '½'],
            hint: 'Turn each one into a decimal.',
            why: '¼ = 0.25, ⅓ ≈ 0.333, ⅖ = 0.4, ½ = 0.5.'
        },
        {
            d: 'Easy', kind: 'gridmap', cat: 'Grid deduction', time: 45,
            q: 'Switch on every cell that holds a multiple of 3.', size: 3, labels: [1, 2, 3, 4, 5, 6, 7, 8, 9], ans: [2, 5, 8],
            hint: 'Count in threes.',
            why: 'Between 1 and 9 the multiples of 3 are 3, 6 and 9.'
        },

        /* -------------------------------------------------------------- MEDIUM */
        {
            d: 'Medium', kind: 'number', cat: 'Number sequences', time: 40,
            q: '3, 5, 9, 17, 33, ?', unit: 'the missing number', ans: 65,
            hint: 'Double each term and see how far off you land.',
            why: 'Each term is double the last, minus one: 33 × 2 − 1 = 65.'
        },
        {
            d: 'Medium', kind: 'choice', cat: 'Odd one out', time: 40,
            q: 'Which one does not belong?', opts: ['21', '27', '33', '35', '39'], ans: '35',
            hint: 'Add the digits of each number.',
            why: '21, 27, 33 and 39 all divide by 3. 35 = 5 × 7 and does not.'
        },
        {
            d: 'Medium', kind: 'cells', cat: 'Missing number', time: 40, cols: 3,
            q: 'Each row adds to the same total. Fill the last cell.',
            cells: [8, 1, 6, 3, 5, 7, 4, 9, null], ans: [2],
            hint: 'Add up the two complete rows.',
            why: 'Both full rows sum to 15, so the last cell is 15 − 4 − 9 = 2.'
        },
        {
            d: 'Medium', kind: 'choice', cat: 'Pattern recognition', time: 40,
            q: 'A1, C3, E5, G7, ?', opts: ['H8', 'I8', 'I9', 'J9'], ans: 'I9',
            hint: 'The letter and the number are telling you the same thing.',
            why: 'The letters step by two (A, C, E, G, I) and the digit is that letter’s place in the alphabet. I is the ninth letter.'
        },
        {
            d: 'Medium', kind: 'number', cat: 'Symbol substitution', time: 40,
            q: '● = 4, ■ = ● × 3, ▲ = ■ − ?. What is ▲ + ■ ÷ ● ?', unit: 'the value', ans: 11,
            hint: 'Find each shape on its own line before touching the last one.',
            why: '▲ = ■ − ● = 12 − 4 = 8, and ■ ÷ ● = 3. Division first: 8 + 3 = 11.'
        },
        {
            d: 'Medium', kind: 'gridmap', cat: 'Grid deduction', time: 40,
            q: 'Switch on every cell that holds a prime number.', size: 4, labels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], ans: [1, 2, 4, 6, 10, 12],
            hint: 'Cross out 1, then every multiple of 2 and of 3.',
            why: 'The primes below 17 are 2, 3, 5, 7, 11 and 13. 1 is not prime; 9 and 15 belong to 3.'
        },
        {
            d: 'Medium', kind: 'arrange', cat: 'Spatial arrangement', time: 40, par: 4,
            q: 'Order these shapes by perimeter, shortest first.',
            tiles: ['triangle 3·4·5', 'square side 4', 'rectangle 2×7', 'rectangle 1×9'],
            ans: ['triangle 3·4·5', 'square side 4', 'rectangle 2×7', 'rectangle 1×9'],
            hint: 'A perimeter is every side added together.',
            why: 'The perimeters are 12, 16, 18 and 20 in that order.'
        },
        {
            d: 'Medium', kind: 'choice', cat: 'Rule-based logic', time: 40,
            q: 'Ada beat Bo. Bo beat Cy. Dee beat Ada. Who came second of the four?',
            opts: ['Ada', 'Bo', 'Cy', 'Dee'], ans: 'Ada',
            hint: 'Write the four as one line, best to worst.',
            why: 'Dee > Ada > Bo > Cy, so second place is Ada.'
        },

        /* ---------------------------------------------------------------- HARD */
        {
            d: 'Hard', kind: 'number', cat: 'Number sequences', time: 35,
            q: '2, 5, 11, 23, 47, ?', unit: 'the missing number', ans: 95,
            hint: 'Compare each term with double the one before.',
            why: 'Each term doubles and adds one: 47 × 2 + 1 = 95.'
        },
        {
            d: 'Hard', kind: 'choice', cat: 'Odd one out', time: 35,
            q: 'Which one does not belong?', opts: ['121', '169', '225', '289'], ans: '225',
            hint: 'Take the square root of each, then ask whether that number is prime.',
            why: '121 = 11², 169 = 13² and 289 = 17² are squares of primes. 225 = 15² and 15 is 3 × 5.'
        },
        {
            d: 'Hard', kind: 'cells', cat: 'Missing number', time: 35, cols: 4,
            q: 'Each column follows one rule: top × middle − 10 = bottom. Fill both blanks.',
            cells: [4, 6, 7, 9, 5, 3, null, 4, 10, 8, 25, null], ans: [5, 26],
            hint: 'Check the rule against the two columns that are already complete.',
            why: '4 × 5 − 10 = 10 and 6 × 3 − 10 = 8 confirm the rule. So 7 × ? − 10 = 25 gives 5, and 9 × 4 − 10 = 26.'
        },
        {
            d: 'Hard', kind: 'number', cat: 'Pattern recognition', time: 35,
            q: '1, 11, 21, 1211, 111221, ?', unit: 'the next line', ans: 312211,
            hint: 'Say out loud what you see in the previous number.',
            why: 'Each line describes the one above it. 111221 is three 1s, two 2s, one 1, so the next line is 312211.'
        },
        {
            d: 'Hard', kind: 'number', cat: 'Symbol substitution', time: 35,
            q: '● + ● + ■ = 12 and ● + ■ + ■ = 15. What is ● × ■ ?', unit: 'the product', ans: 18,
            hint: 'Add the two lines together first.',
            why: 'Both lines together are 3● + 3■ = 27, so ● + ■ = 9. That makes ● = 3 and ■ = 6, and 3 × 6 = 18.'
        },
        {
            d: 'Hard', kind: 'gridmap', cat: 'Grid deduction', time: 35,
            q: 'Light exactly four cells so that every row has one lit cell and every column has one lit cell.',
            size: 4, labels: ['·', '·', '·', '·', '·', '·', '·', '·', '·', '·', '·', '·', '·', '·', '·', '·'],
            rule: function (on) {
                if (on.length !== 4) return false;
                const rows = {}, cols = {};
                on.forEach(function (i) { rows[Math.floor(i / 4)] = (rows[Math.floor(i / 4)] || 0) + 1; cols[i % 4] = (cols[i % 4] || 0) + 1; });
                return [0, 1, 2, 3].every(function (k) { return rows[k] === 1 && cols[k] === 1; });
            },
            hint: 'Place one in the top row, then never reuse its column.',
            why: 'Any arrangement with one cell per row and one per column counts. There are 4 × 3 × 2 × 1 = 24 of them.'
        },
        {
            d: 'Hard', kind: 'arrange', cat: 'Spatial arrangement', time: 35, par: 4,
            q: 'Order these fractions from smallest to largest.',
            tiles: ['3/5', '7/12', '2/3', '5/8'], ans: ['7/12', '3/5', '5/8', '2/3'],
            hint: 'Convert to decimals, or use a denominator of 120.',
            why: 'As decimals they are 0.583, 0.600, 0.625 and 0.667, so the fractions line up 7/12, 3/5, 5/8, 2/3.'
        },
        {
            d: 'Hard', kind: 'choice', cat: 'Rule-based logic', time: 35,
            q: 'Ada says “Bo lies”. Bo says “Cy lies”. Cy says “Ada and Bo both lie”. Exactly one of the three tells the truth. Who?',
            opts: ['Ada', 'Bo', 'Cy', 'Nobody'], ans: 'Bo',
            hint: 'Assume Cy is truthful and look for the contradiction.',
            why: 'If Cy were truthful then Ada and Bo both lie. But a lying Ada makes Bo truthful, which contradicts Cy. So Cy lies, Bo’s claim is correct, Bo tells the truth and Ada’s claim about Bo is wrong.'
        },

        /* -------------------------------------------------------------- EXPERT */
        {
            d: 'Expert', kind: 'number', cat: 'Number sequences', time: 30,
            q: '1, 2, 6, 21, 88, ?', unit: 'the missing number', ans: 445,
            hint: 'The step grows: ×1, then ×2, then ×3.',
            why: 'Multiply by 1, 2, 3, 4, 5 and add the same number back: 88 × 5 + 5 = 445.'
        },
        {
            d: 'Expert', kind: 'number', cat: 'Number sequences', time: 30,
            q: '1, 4, 27, 256, ?', unit: 'the missing number', ans: 3125,
            hint: 'Write the positions 1, 2, 3, 4 above the terms.',
            why: 'Each term is its own position raised to its own power: 1¹, 2², 3³, 4⁴. So the next is 5⁵ = 3125.'
        },
        {
            d: 'Expert', kind: 'choice', cat: 'Odd one out', time: 30,
            q: 'Which one does not belong?', opts: ['21', '33', '35', '51', '60'], ans: '60',
            hint: 'Split each number into its prime factors and count them.',
            why: '21 = 3×7, 33 = 3×11, 35 = 5×7 and 51 = 3×17 are each the product of exactly two primes. 60 = 2×2×3×5 has four.'
        },
        {
            d: 'Expert', kind: 'gridmap', cat: 'Grid deduction', time: 30,
            q: 'Light cells so that every row and every column holds an ODD number of lit cells, and light as few as you possibly can.',
            size: 4, labels: ['·', '·', '·', '·', '·', '·', '·', '·', '·', '·', '·', '·', '·', '·', '·', '·'],
            rule: function (on) {
                if (on.length !== 4) return false;
                const rows = [0, 0, 0, 0], cols = [0, 0, 0, 0];
                on.forEach(function (i) { rows[Math.floor(i / 4)]++; cols[i % 4]++; });
                return rows.every(function (n) { return n % 2 === 1; }) && cols.every(function (n) { return n % 2 === 1; });
            },
            hint: 'Four is the floor: each of the four rows needs at least one.',
            why: 'Four cells, one in every row and one in every column, keeps every count at exactly 1, which is odd. Two lit cells in a row would make it even, so four really is the minimum.'
        },
        {
            d: 'Expert', kind: 'number', cat: 'Symbol substitution', time: 30,
            q: '▲ = 2, ★ = ▲ × 3, ● = ★ − ▲, ■ = ● × ▲. What is (■ − ★) ÷ ▲ ?', unit: 'the value', ans: 1,
            hint: 'Solve the shapes one line at a time, then do only the brackets.',
            why: '▲ = 2, ★ = 6, ● = 4, ■ = 8, and (8 − 6) ÷ 2 = 1.'
        },
        {
            d: 'Expert', kind: 'cells', cat: 'Missing number', time: 30, cols: 4,
            q: 'Each column follows one rule: top squared, minus the middle, equals the bottom. Fill both blanks.',
            cells: [5, 4, 6, null, 3, 2, null, 1, 22, 14, 29, 15], ans: [4, 7],
            hint: 'Test the two complete columns against top squared.',
            why: '5² − 3 = 22 and 4² − 2 = 14 confirm the rule. So 6² − ? = 29 gives 7, and ?² − 1 = 15 gives 4.'
        },
        {
            d: 'Expert', kind: 'arrange', cat: 'Spatial arrangement', time: 30, par: 4,
            q: 'Order these powers from smallest to largest.',
            tiles: ['2⁵', '3³', '4³', '5²'], ans: ['5²', '3³', '2⁵', '4³'],
            hint: 'Write each one out as a plain number first.',
            why: '5² = 25, 3³ = 27, 2⁵ = 32 and 4³ = 64.'
        },
        {
            d: 'Expert', kind: 'choice', cat: 'Pattern recognition', time: 30,
            q: '(2, 3, 11)   (4, 5, 29)   (3, 7, ?)', opts: ['27', '31', '34', '37'], ans: '31',
            hint: 'Try multiplying the first two and then adding the first two.',
            why: 'The third number is the first times the second, plus both of them: 3 × 7 + 3 + 7 = 31.'
        }
    ];

    const BAND = { Easy: 1, Medium: 2, Hard: 3, Expert: 4 };

    /* ------------------------------------------------------------- run state */
    let api = null, order = [], log = [], shuffle = {}, timer = null, deadline = 0, keyHandler = null, solver = null;

    function clearTimers() {
        if (timer) { clearInterval(timer); timer = null; }
        if (keyHandler) { document.removeEventListener('keydown', keyHandler); keyHandler = null; }
    }

    function listFor(difficulty) {
        const list = PUZZLES.filter(function (p) { return p.d === difficulty; });
        return list.length ? list : PUZZLES.filter(function (p) { return p.d === 'Medium'; });
    }

    function shuffled(arr, seedKey) {
        if (shuffle[seedKey]) return shuffle[seedKey];
        const copy = arr.slice();
        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const t = copy[i]; copy[i] = copy[j]; copy[j] = t;
        }
        shuffle[seedKey] = copy;
        return copy;
    }

    /* ------------------------------------------------------------- answering */
    function attempt(correct, wrongMsg) {
        const p = order[api.level];
        log[api.level].misses = p.attempts;
        if (api.locked) return;
        clearTimers();
        if (correct) {
            api.explain(p.why);
            api.bumpMoves(1);
            log[api.level].out = 'right';
            api.solved({ par: 1 });
        } else {
            api.failed(wrongMsg || 'Not that one.');
        }
    }

    /* Out of time is not a loss: the answer and the reasoning are shown, and the
       question is marked skipped so the review screen tells the truth about it. */
    function reveal(p, whyNot) {
        clearTimers();
        if (api.locked) return;
        const body = h('div', { class: 'ml-sheet-body' });
        body.appendChild(h('p', { class: 'ml-p', text: whyNot }));
        body.appendChild(h('p', { class: 'ml-prompt', text: 'Answer: ' + answerText(p) }));
        body.appendChild(h('p', { class: 'ml-fine', text: p.why }));
        body.appendChild(h('div', { class: 'ml-sheet-actions' }, [
            h('button', {
                class: 'ml-btn ml-btn-hot', type: 'button', text: 'Mark it and move on',
                onclick: function () { M.closeSheet(); api.skip(); }
            })
        ]));
        M.sheet(body, { title: 'Time on this one', sticky: true, wide: true });
    }

    function answerText(p) {
        if (p.kind === 'choice') return p.ans;
        if (p.kind === 'arrange') return p.ans.join('  →  ');
        if (p.kind === 'cells') return p.ans.join(' and ');
        if (p.kind === 'gridmap') return p.rule ? 'see the explanation' : p.labels ? p.ans.map(function (i) { return p.labels[i]; }).join(', ') : p.ans.join(', ');
        return String(p.ans);
    }

    /* ---------------------------------------------------------------- render */
    function play(i) {
        clearTimers();
        solver = null;
        const p = order[i];
        const idx = i;
        api.setLevel(idx, p.cat, order.length);
        api.setPar((p.time || 40) * 1000, p.par || (p.kind === 'arrange' ? 5 : 2));
        api.setHint(p.hint);
        api.explain(p.why);
        p.attempts = 0;

        const host = api.host;
        host.innerHTML = '';
        log[idx] = { cat: p.cat, q: p.q, out: 'open', misses: 0 };

        host.appendChild(h('p', { class: 'ml-prompt', text: p.q }));
        const clock = h('span', { class: 'ml-count', text: p.time + 's left' });
        host.appendChild(clock);

        const stageEl = h('div', { class: 'ml-qbody' });
        host.appendChild(stageEl);

        /* time limit, identical for both players in a versus run */
        deadline = Date.now() + p.time * 1000;
        timer = setInterval(function () {
            const left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
            clock.textContent = left + 's left';
            clock.classList.toggle('is-low', left <= 10);
            if (left <= 0) {
                clearTimers();
                if (!api.locked) { log[idx].out = 'time'; reveal(p, 'Time ran out on this one.'); }
            }
        }, 500);

        if (p.kind === 'choice') buildChoice(stageEl, p, idx);
        else if (p.kind === 'number') buildNumber(stageEl, p);
        else if (p.kind === 'cells') buildCells(stageEl, p);
        else if (p.kind === 'gridmap') buildGridmap(stageEl, p);
        else if (p.kind === 'arrange') buildArrange(stageEl, p, idx);
    }

    function buildChoice(stageEl, p, idx) {
        const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
        const items = shuffled(p.opts, 'c' + idx);
        const wrap = h('div', { class: 'ml-opts', role: 'group', 'aria-label': 'Choose one' });
        items.forEach(function (text, n) {
            const b = h('button', {
                class: 'ml-opt', type: 'button', 'aria-label': letters[n] + ': ' + text,
                html: '<kbd>' + letters[n] + '</kbd><span>' + esc(text) + '</span>'
            });
            b.onclick = function () {
                if (api.locked) return;
                api.bumpMoves(1);
                if (text === p.ans) {
                    b.classList.add('is-right');
                    attempt(true);
                } else {
                    p.attempts++;
                    b.classList.add('is-wrong');
                    setTimeout(function () { b.classList.remove('is-wrong'); }, M.reduced() ? 0 : 420);
                    attempt(false);
                    if (p.attempts === 2) api.say('Two misses. The Hint button is there for a reason.');
                }
            };
            wrap.appendChild(b);
        });
        stageEl.appendChild(wrap);
        solver = function () { const at = items.indexOf(p.ans); if (at >= 0) wrap.children[at].click(); };
        keyHandler = function (e) {
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            if (!api || !api.host.offsetParent) return;
            const letter = /^[1-9]$/.test(e.key) ? Number(e.key) - 1 : 'ABCDEF'.indexOf(String(e.key).toUpperCase());
            if (letter >= 0 && wrap.children[letter]) { e.preventDefault(); wrap.children[letter].click(); }
        };
        document.addEventListener('keydown', keyHandler);
    }

    function buildNumber(stageEl, p) {
        const input = h('input', {
            class: 'ml-input', type: 'text', inputmode: 'numeric', autocomplete: 'off', spellcheck: 'false',
            'aria-label': p.unit || 'your answer'
        });
        const go = h('button', {
            class: 'ml-btn ml-btn-hot', type: 'button',
            html: '<i class="fas fa-check" aria-hidden="true"></i> Answer',
            onclick: function () { submit(); }
        });
        function submit() {
            if (api.locked) return;
            const raw = input.value.trim().replace(/[,\s]/g, '');
            if (!raw) { api.say('Type a number first.'); return; }
            api.bumpMoves(1);
            const val = Number(raw);
            if (!Number.isFinite(val)) { attempt(false, 'That is not a number.'); return; }
            if (val === p.ans) { input.disabled = true; go.disabled = true; attempt(true); }
            else { p.attempts++; attempt(false, val + ' is not it.'); }
        }
        input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
        stageEl.appendChild(input);
        stageEl.appendChild(h('div', { class: 'ml-row' }, [go]));
        solver = function () { input.value = String(p.ans); submit(); };
        setTimeout(function () { try { input.focus(); } catch (e) {} }, 60);
    }

    function buildCells(stageEl, p) {
        const grid = h('div', { class: 'ml-numgrid', style: '--cols:' + p.cols });
        const inputs = [];
        p.cells.forEach(function (v, n) {
            if (v === null || v === undefined) {
                const c = h('input', {
                    class: 'ml-cell is-blank', type: 'text', inputmode: 'numeric', autocomplete: 'off',
                    'aria-label': 'blank ' + (inputs.length + 1)
                });
                inputs.push(c);
                grid.appendChild(c);
            } else {
                grid.appendChild(h('b', { class: 'ml-cell', text: String(v) }));
            }
        });
        const go = h('button', {
            class: 'ml-btn ml-btn-hot', type: 'button',
            html: '<i class="fas fa-check" aria-hidden="true"></i> Check the grid',
            onclick: function () {
                if (api.locked) return;
                if (inputs.some(function (c) { return !c.value.trim(); })) { api.say('Fill every blank first.'); return; }
                api.bumpMoves(1);
                const got = inputs.map(function (c) { return Number(c.value.trim()); });
                const ok = got.length === p.ans.length && got.every(function (v, n) { return v === p.ans[n]; });
                if (ok) { inputs.forEach(function (c) { c.disabled = true; }); go.disabled = true; attempt(true); }
                else { p.attempts++; attempt(false, 'Not every blank is right.'); }
            }
        });
        stageEl.appendChild(grid);
        stageEl.appendChild(h('div', { class: 'ml-row' }, [go]));
        stageEl.appendChild(h('p', { class: 'ml-clue', text: inputs.length + ' blank' + (inputs.length === 1 ? '' : 's') + ' to fill. They count left to right, top to bottom.' }));
        solver = function () {
            inputs.forEach(function (c, n) { c.value = String(p.ans[n]); });
            go.click();
        };
    }

    function buildGridmap(stageEl, p) {
        const grid = h('div', { class: 'ml-gridmap', style: 'grid-template-columns: repeat(' + p.size + ', auto)' });
        const cells = [];
        for (let i = 0; i < p.size * p.size; i++) {
            const label = p.labels ? String(p.labels[i]) : String(i + 1);
            const b = h('button', {
                type: 'button', class: 'ml-gcell', 'aria-pressed': 'false', 'aria-label': 'cell ' + (i + 1) + (label === '·' ? '' : ' holding ' + label),
                text: label
            });
            b.onclick = function () {
                if (api.locked) return;
                const on = b.getAttribute('aria-pressed') !== 'true';
                b.setAttribute('aria-pressed', on ? 'true' : 'false');
                api.bumpMoves(1);
                count.textContent = lit().length + ' lit';
            };
            cells.push(b);
            grid.appendChild(b);
        }
        function lit() {
            return cells.reduce(function (a, b, i) { if (b.getAttribute('aria-pressed') === 'true') a.push(i); return a; }, []);
        }
        const count = h('span', { class: 'ml-count', text: '0 lit' });
        const go = h('button', {
            class: 'ml-btn ml-btn-hot', type: 'button',
            html: '<i class="fas fa-check" aria-hidden="true"></i> Check',
            onclick: function () {
                if (api.locked) return;
                const on = lit();
                if (!on.length) { api.say('Light at least one cell.'); return; }
                let ok;
                if (p.rule) ok = !!p.rule(on.slice());
                else {
                    const want = p.ans.slice().sort(function (a, b) { return a - b; });
                    ok = on.length === want.length && on.every(function (v, i) { return v === want[i]; });
                }
                if (ok) { cells.forEach(function (c) { c.disabled = true; }); go.disabled = true; attempt(true); }
                else { p.attempts++; attempt(false, 'That grid does not fit the rule.'); }
            }
        });
        stageEl.appendChild(grid);
        stageEl.appendChild(h('div', { class: 'ml-row' }, [go, count]));
        stageEl.appendChild(h('p', { class: 'ml-clue', text: p.rule ? 'Any grid that fits the rule counts as correct.' : 'Tap a cell to switch it on or off.' }));
        solver = p.rule
            ? function () { const set = findRuleSet(p); if (set) { set.forEach(function (i) { cells[i].click(); }); go.click(); } }
            : function () { p.ans.forEach(function (i) { cells[i].click(); }); go.click(); };
    }

    /* Rule-based grids have more than one right answer, so the self-test walks
       the combinations until it finds one the rule accepts. */
    function findRuleSet(p) {
        const n = p.size * p.size;
        for (let k = 1; k <= Math.min(8, n); k++) {
            const pick = [];
            const combo = function (start) {
                if (pick.length === k) return p.rule(pick.slice()) ? pick.slice() : null;
                for (let i = start; i < n; i++) {
                    pick.push(i);
                    const r = combo(i + 1);
                    if (r) return r;
                    pick.pop();
                }
                return null;
            };
            const found = combo(0);
            if (found) return found;
        }
        return null;
    }

    function buildArrange(stageEl, p, idx) {
        const tiles = shuffled(p.tiles, 't' + idx);
        const placed = [];
        const tileWrap = h('div', { class: 'ml-tiles', role: 'group', 'aria-label': 'Pieces to place' });
        const slotWrap = h('div', { class: 'ml-slots', role: 'group', 'aria-label': 'Your order' });
        const tileBtns = tiles.map(function (text) {
            const b = h('button', { type: 'button', class: 'ml-tile', 'aria-pressed': 'false', text: text });
            b.onclick = function () {
                if (api.locked || b.classList.contains('is-placed')) return;
                if (placed.length >= p.ans.length) { api.say('That is every slot filled.'); return; }
                placed.push({ text: text, tile: b, slot: slots[placed.length] });
                b.classList.add('is-placed');
                paintSlots();
                api.bumpMoves(1);
            };
            tileWrap.appendChild(b);
            return b;
        });
        const slots = p.ans.map(function (_, n) {
            const s = h('button', { type: 'button', class: 'ml-slot', 'aria-label': 'position ' + (n + 1), text: '·' });
            s.onclick = function () {
                if (api.locked) return;
                const at = slots.indexOf(s);
                const entry = placed[at];
                if (!entry) return;
                placed.splice(at, 1);
                entry.tile.classList.remove('is-placed');
                slots.slice(at).forEach(function (sl, k) {
                    const e = placed[k];
                    sl.textContent = e ? e.text : '·';
                    sl.classList.toggle('is-full', !!e);
                    if (e) e.slot = sl;
                });
                api.bumpMoves(1);
            };
            slotWrap.appendChild(s);
            return s;
        });
        function paintSlots() {
            slots.forEach(function (sl, n) {
                const e = placed[n];
                sl.textContent = e ? e.text : '·';
                sl.classList.toggle('is-full', !!e);
                if (e) e.slot = sl;
            });
        }
        const go = h('button', {
            class: 'ml-btn ml-btn-hot', type: 'button',
            html: '<i class="fas fa-check" aria-hidden="true"></i> That is the order',
            onclick: function () {
                if (api.locked) return;
                if (placed.length !== p.ans.length) { api.say('Fill every slot before you commit.'); return; }
                const got = placed.map(function (e) { return e.text; });
                const ok = got.every(function (v, n) { return v === p.ans[n]; });
                if (ok) { attempt(true); }
                else { p.attempts++; attempt(false, 'Not that order.'); }
            }
        });
        stageEl.appendChild(h('p', { class: 'ml-label', text: 'Tap a piece to place it, tap a slot to take it back' }));
        stageEl.appendChild(slotWrap);
        stageEl.appendChild(tileWrap);
        stageEl.appendChild(h('div', { class: 'ml-row' }, [go]));
        paintSlots();
        solver = function () {
            p.ans.forEach(function (text) {
                const at = tiles.indexOf(text);
                if (at >= 0 && !tileBtns[at].classList.contains('is-placed')) tileBtns[at].click();
            });
            go.click();
        };
    }

    /* ---------------------------------------------------------------- review */
    function review() {
        if (!log.length) return [];
        const rows = log.map(function (r, n) {
            const mark = r.out === 'right' ? 'fa-circle-check' : r.out === 'time' ? 'fa-clock' : 'fa-circle-xmark';
            const word = r.out === 'right' ? 'Correct' : r.out === 'time' ? 'Out of time' : 'Skipped';
            return h('div', { class: 'ml-review-row' }, [
                h('p', { class: 'ml-review-q', html: '<i class="fas ' + mark + '" aria-hidden="true"></i> Q' + (n + 1) + ' · ' + esc(r.cat) + ', ' + word + (r.misses ? ' after ' + r.misses + ' miss' + (r.misses === 1 ? '' : 'es') : '') }),
                h('p', { class: 'ml-fine', text: order[n].why })
            ]);
        });
        return [h('div', { class: 'ml-review' }, [h('h4', { class: 'ml-review-title', text: 'Every question, with the reasoning' })].concat(rows))];
    }

    /* --------------------------------------------------------------- register */
    M.register('grid', {
        rules: function () {
            return [
                'Eight questions to a run, drawn from thirty-two authored puzzles.',
                'Answer by tapping an option, typing a number, filling cells or ordering tiles.',
                'Every question carries its own clock and its own hint.',
                'Running out of time is not a loss: the answer is shown and the question is marked skipped.',
                'Score is 100 x difficulty, plus bonuses for beating par time and par moves.',
                'Costs: a wrong guess 5, a hint 25, a skip 20.',
                'Versus deals you both the same eight, in the same order, on the same clock.'
            ];
        },
        start: function (a) {
            api = a;
            order = listFor(a.difficulty);
            shuffle = {};
            log = [];
            a.onReset(play);
            play(0);
        },
        next: function (a) {
            if (a.level + 1 >= order.length) { a.finish(); return; }
            play(a.level + 1);
        },
        // Drives the real controls, so the harness proves the widgets are wired
        // to the authored answer rather than the answer existing on its own.
        solve: function () { if (solver) solver(); },
        review: review
    });
})();
