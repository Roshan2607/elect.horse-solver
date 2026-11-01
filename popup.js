
'use strict';

const $ = id => document.getElementById(id);

let board = null;
let solution = null;
let worker = null;
let tabId = null;

const palette = [
  '#fbc84e', '#ba8df1', '#50d6a1',
  '#ff9758', '#5aa6ed', '#fb83ac', '#b3e55b'
];

function status(msg, error = false) {
  $('status').textContent = msg;
  $('status').className = error ? 'error' : '';
}

function countBoard() {
  if (!board) return;

  const counts = {
    horse: 0, cow: 0, donkey: 0,
    goat: 0, water: 0, empty: 0
  };

  for (const t of board.tiles) {
    if (t.kind === 1) counts.horse++;
    else if (t.kind === 2) counts.cow++;
    else if (t.kind === 3) counts.donkey++;
    else if (t.kind === 4) counts.goat++;
    else if (t.kind === -1) counts.water++;
    else counts.empty++;
  }

  board.total =
    counts.horse + counts.cow +
    counts.donkey + counts.goat;

  $('stats').innerHTML = `
    <span class="meta">
      ${board.total} voters · ${board.tiles.length} hexes ·
      ${counts.water} water
    </span>
    <span class="chip" style="--c:#5fd3ff">${counts.horse}</span>
    <span class="chip" style="--c:#ff4d6d">${counts.cow}</span>
    <span class="chip" style="--c:#b58cff">${counts.donkey}</span>
    <span class="chip" style="--c:#f4dc73">${counts.goat}</span>
  `;

  const candidates = Array.from(
    { length: 11 }, (_, i) => i + 2
  ).filter(k => board.total % k === 0);

  const select = $('districts');

  for (const option of select.options)
    option.disabled = !candidates.includes(+option.value);

  if (!candidates.includes(+select.value) ||
      (board.total === 48 && select.value === '3')) {

    select.value = String(
      board.total === 48 && candidates.includes(8)
        ? 8
        : candidates.includes(3)
        ? 3
        : candidates[0] || 2
    );
  }
}

function drawMini() {
  if (!board) return;

  const svg = $('board');
  svg.style.display = 'block';
  $('legend').hidden = false;
  svg.replaceChildren();

  const tiles = board.tiles;

  const minx = Math.min(...tiles.map(t => t.x));
  const maxx = Math.max(...tiles.map(t => t.x));
  const miny = Math.min(...tiles.map(t => t.y));
  const maxy = Math.max(...tiles.map(t => t.y));

  const scale = Math.min(
    358 / (maxx - minx + board.dx),
    180 / (maxy - miny + board.dx)
  );

  const x0 = 200 - (minx + maxx) * scale / 2;
  const y0 = 105 - (miny + maxy) * scale / 2;
  const r = board.dx / Math.sqrt(3) * scale;

  const ns = 'http://www.w3.org/2000/svg';

  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];

    const cx = t.x * scale + x0;
    const cy = t.y * scale + y0;

    const pts = Array.from({ length: 6 }, (_, a) => [
      cx + r * Math.cos((a * 60 - 90) * Math.PI / 180),
      cy + r * Math.sin((a * 60 - 90) * Math.PI / 180)
    ]);

    const hex = document.createElementNS(ns, 'polygon');

    hex.setAttribute(
      'points',
      pts.map(p => p.join(',')).join(' ')
    );

    const col = solution && solution.assignment[i] >= 0
      ? palette[solution.assignment[i] % palette.length]
      : '#1b7345';

    hex.setAttribute('fill', col);
    hex.setAttribute(
      'fill-opacity',
      solution ? '.53' : '.78'
    );
    hex.setAttribute('stroke', '#99bda3');
    hex.setAttribute('stroke-width', '1');

    hex.addEventListener('click', () => {
      if (worker) {
        status('Finish the search before editing.');
        return;
      }

      const next = {
        [-1]: 0,
        0: 1,
        1: 2,
        2: 3,
        3: 4,
        4: -1
      };

      t.kind = next[t.kind];
      solution = null;

      $('place').disabled = true;
      $('results').style.display = 'none';

      countBoard();
      drawMini();

      status('Tile updated. Solve again.');
    });

    svg.appendChild(hex);

    if (t.kind !== 0) {
      const mark = document.createElementNS(
        ns, t.kind === -1 ? 'rect' : 'circle'
      );

      if (t.kind === -1) {
        mark.setAttribute('x', cx - r * .37);
        mark.setAttribute('y', cy - r * .35);
        mark.setAttribute('width', r * .75);
        mark.setAttribute('height', r * .7);
        mark.setAttribute('rx', '3');
        mark.setAttribute('fill', '#062f48');
      } else {
        const colors = {
          1: '#5fd3ff',
          2: '#ff4d6d',
          3: '#b58cff',
          4: '#f4dc73'
        };

        mark.setAttribute('cx', cx);
        mark.setAttribute('cy', cy);
        mark.setAttribute('r', r * .30);
        mark.setAttribute('fill', colors[t.kind]);
      }

      mark.setAttribute('pointer-events', 'none');
      svg.appendChild(mark);
    }
  }
}

function send(message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, response => {
      const error = chrome.runtime.lastError;
      if (error) reject(Error(error.message));
      else resolve(response);
    });
  });
}

async function ensureTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  if (
    !tab?.id ||
    !/^https:\/\/(?:www\.)?elect\.horse(?:\/|$)/.test(tab.url || '')
  ) {
    throw Error('Open elect.horse first.');
  }

  tabId = tab.id;
  return tab;
}

async function inject() {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content.js']
  });
}

// CAPTURE BOARD

$('scan').addEventListener('click', async () => {
  try {
    $('scan').disabled = true;
    $('solve').disabled = true;
    $('place').disabled = true;

    if (worker) {
      worker.terminate();
      worker = null;
    }

    solution = null;
    $('results').style.display = 'none';

    status('Capturing board…');

    await ensureTab();
    await inject();

    await send({ type: 'ELECT_CLEAR' });

    const url = await chrome.tabs.captureVisibleTab(
      undefined, { format: 'png' }
    );

    const image = new Image();
    image.src = url;
    await image.decode();

    const canvas = document.createElement('canvas');

    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;

    const ctx = canvas.getContext('2d', {
      willReadFrequently: true
    });

    ctx.drawImage(image, 0, 0);

    board = ElectParser.identifyBoard(
      ctx.getImageData(
        0, 0, canvas.width, canvas.height
      )
    );

    countBoard();
    drawMini();

    $('solve').disabled = false;

    status('Check detected tiles, then solve.');

  } catch (e) {
    board = null;

    $('board').style.display = 'none';
    $('legend').hidden = true;
    $('stats').textContent = 'No board captured';

    status('Capture failed: ' + e.message, true);

  } finally {
    $('scan').disabled = false;
  }
});

// SOLVE DISTRICTS

$('solve').addEventListener('click', async () => {
  if (!board) return;

  try {
    await ensureTab();
    await inject();

    const k = Number($('districts').value);

    if (board.total % k !== 0) {
      throw Error('Voters cannot be divided equally.');
    }

    if (worker) {
      worker.terminate();
      worker = null;
    }

    solution = null;
    $('place').disabled = true;
    $('results').style.display = 'none';
    $('solve').disabled = true;

    status('Searching…');

    worker = new Worker('solver-worker.js');

    const options = $('effort').value === 'deep'
      ? {
          maxStates: 12000000,
          maxMillis: 30000,
          maxCandidatesPerDistrict: 90000
        }
      : {
          maxStates: 1250000,
          maxMillis: 7500,
          maxCandidatesPerDistrict: 18000
        };

    worker.onmessage = async event => {
      const current = worker;
      worker = null;

      current.terminate();
      $('solve').disabled = false;

      if (event.data.type === 'error') {
        status('Solver error: ' + event.data.message, true);
        return;
      }

      const result = event.data.result;

      if (!result.ok) {
        $('results').style.display = 'none';

        status(
          result.reason + ' Explored ' +
          result.expanded.toLocaleString() + ' states.',
          true
        );

        return;
      }

      solution = result;
      drawMini();

      const rows = result.stats.map(s => {
        const votes = [
          s.counts[1] || 0,
          s.counts[2] || 0,
          s.counts[3] || 0,
          s.counts[4] || 0
        ].join(' / ');

        const names = [
          'Tie', 'Horse', 'Cow', 'Donkey', 'Goat'
        ];

        return `D${s.district}: ${votes} → ${names[s.winner] || 'Other'}`;
      }).join('<br>');

      $('results').style.display = 'block';

      $('results').innerHTML = `
        <strong>
          ${result.horseLeads ? 'Horse leads' : 'Best plan found'}
          · ${result.horseWins}/${k} seats
        </strong>

        <div class="muted">
          ${result.expanded.toLocaleString()} states ·
          ${(result.millis / 1000).toFixed(1)} s
        </div>

        <details>
          <summary>District details</summary>
          <div class="districts">
            Horse / Cow / Donkey / Goat<br>
            ${rows}
          </div>
        </details>
      `;

      try {
        const response = await send({
          type: 'ELECT_PREVIEW',
          board,
          assignment: result.assignment
        });

        if (!response?.ok) {
          throw Error(response?.reason || 'No response');
        }

        $('place').disabled = false;

        status(
          result.warning ||
          'Preview ready. Check the boundaries.'
        );

      } catch (e) {
        status(
          'Solved, but preview failed: ' + e.message,
          true
        );
      }
    };

    worker.onerror = e => {
      worker?.terminate();
      worker = null;
      $('solve').disabled = false;

      status('Search failed: ' + e.message, true);
    };

    worker.postMessage({ board, k, options });

  } catch (e) {
    $('solve').disabled = false;
    status(e.message, true);
  }
});

// AUTOMATIC PLACEMENT

$('place').addEventListener('click', async () => {
  if (!solution || !board) return;

  try {
    $('place').disabled = true;

    await ensureTab();
    await inject();

    status('Sending clicks…');

    const response = await send({
      type: 'ELECT_PLACE',
      board,
      assignment: solution.assignment
    });

    if (!response?.ok) {
      throw Error(
        response?.reason || 'The page did not respond'
      );
    }

    status(
      `${response.sent} clicks sent. Verify in game.`
    );

  } catch (e) {
    status('Auto-place failed: ' + e.message, true);

  } finally {
    $('place').disabled = false;
  }
});

// HIDE OVERLAY

$('clear').addEventListener('click', async () => {
  try {
    await ensureTab();

    await send({ type: 'ELECT_CLEAR' });

    status('Overlay hidden.');

  } catch (e) {
    status('Could not hide overlay: ' + e.message, true);
  }
});

// RESTORE PREVIOUS PREVIEW

(async function restorePreviousPreview() {
  try {
    await ensureTab();
    await inject();

    const response = await send({
      type: 'ELECT_GET_STATE'
    });

    if (
      response?.saved?.board &&
      response?.saved?.assignment
    ) {
      board = response.saved.board;
      const assignment = response.saved.assignment;

      solution = { assignment };

      countBoard();
      drawMini();

      $('solve').disabled = false;
      $('place').disabled = false;

      status('Previous preview restored.');
    }

  } catch (e) {
    // Capture a board normally.
  }
})();
