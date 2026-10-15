/* Wireframe sections: the ASCII wireframe from the story, then the HTML board for the screens it draws. */
const NOT_BUILT_MARK = 'Coded screen not built yet';

function labelAsciiWireframes(prose) {
  const h = $$('h2', prose).find((x) => /^6[.\-]/.test(x.id) || /^6\./.test(x.textContent.trim()));
  if (!h) return null;
  let n = h.nextElementSibling;
  while (n && !/^H[12]$/.test(n.tagName)) {
    if (n.classList && n.classList.contains('code-block')) {
      const label = n.querySelector('.code-head span');
      if (label && /^(text|ascii)?$/i.test(label.textContent.trim())) label.textContent = 'ASCII wireframe';
      else if (label && /^text$/i.test(label.textContent)) label.textContent = 'ASCII wireframe';
    }
    n = n.nextElementSibling;
  }
  return h;
}

function scaleBoard(box) {
  const frame = $('iframe', box);
  if (!frame) return;
  const s = Math.min(1, box.clientWidth / 1440);
  frame.style.width = '1440px';
  frame.style.height = Math.round(760 / s) + 'px';
  frame.style.transform = 'scale(' + s + ')';
  box.style.height = '760px';
}

function boardCard(b) {
  const det = document.createElement('details');
  det.className = 'board';
  det.dataset.board = b.id;
  const open = b.html ? ` <a class="board-open" href="${b.html}" target="_blank" rel="noopener noreferrer">Open HTML wireframe</a>` : '';
  det.innerHTML = `<summary>${b.html ? 'Show HTML wireframe' : 'Show wireframe image'}: ${escapeHtml(b.id)} ${escapeHtml(b.name)}</summary><div class="board-box"></div>${open ? `<p class="board-links">${open}</p>` : ''}`;
  det.addEventListener('toggle', () => {
    const box = $('.board-box', det);
    if (!det.open || box.firstChild) { if (det.open) scaleBoard(box); return; }
    if (MODE === 'offline' && b.html) {
      const f = document.createElement('iframe');
      f.setAttribute('sandbox', '');
      f.setAttribute('loading', 'lazy');
      f.title = 'HTML wireframe ' + b.id;
      f.src = b.html;
      box.appendChild(f);
      scaleBoard(box);
    } else {
      const img = document.createElement('img');
      img.src = b.png;
      img.alt = 'Wireframe board ' + b.id + ' ' + b.name;
      img.loading = 'lazy';
      img.setAttribute('data-zoom', '');
      box.classList.add('board-img');
      box.appendChild(img);
    }
  });
  return det;
}

function addWireframeBoards(prose, page, h6) {
  const chain = state.data.chain;
  const st = chain && chain.stories.find((s) => s.page === page.id);
  if (!st || !h6 || !st.boards.length) return;
  const boards = st.boards.map((id) => state.data.chain.boards.find((b) => b.id === id)).filter(Boolean);
  const wrap = document.createElement('div');
  wrap.className = 'boards';
  wrap.innerHTML = `<h3 class="boards-title">HTML wireframes for these screens <span class="chip">${boards.length}</span></h3>`;
  boards.forEach((b) => wrap.appendChild(boardCard(b)));
  let n = h6.nextElementSibling;
  let last = h6;
  while (n && !/^H[12]$/.test(n.tagName)) { last = n; n = n.nextElementSibling; }
  last.after(wrap);
}

/* Marks images that are wireframes shown only because no coded screen exists. */
function markWireframeImages(root, page) {
  $$('img', root).forEach((img) => {
    const src = img.getAttribute('src') || '';
    const role = (page.imgRoles || {})[src];
    if (role === 'section' || role === 'not-built') img.setAttribute('data-wireframe', role);
  });
}
