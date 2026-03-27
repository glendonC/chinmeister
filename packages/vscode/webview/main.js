(function () {
  var vsc = acquireVsCodeApi();

  var state = null;
  var collapsed = {};
  var confirmDeleteId = null;
  var confirmTimer = null;
  var memSearch = '';
  var memFilter = '';

  function esc(s) {
    return s ? String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
  }
  function escA(s) {
    return s ? String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : '';
  }
  function showFlash(text) {
    var el = document.getElementById('flash');
    el.textContent = text;
    el.style.display = 'block';
    setTimeout(function () { el.style.display = 'none'; }, 2500);
  }

  // ── Messages from extension host ──

  window.addEventListener('message', function (event) {
    var msg = event.data;
    if (msg.type === 'update') {
      state = msg.data;
      render();
    } else if (msg.type === 'error') {
      document.getElementById('loading').style.display = 'none';
      document.getElementById('content').style.display = 'none';
      var err = document.getElementById('error-display');
      err.style.display = 'block';
      err.innerHTML = '<p class="err-text">' + esc(msg.message) + '</p>';
    } else if (msg.type === 'flash') {
      showFlash(msg.text);
    }
  });

  // ── Event delegation ──

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.dataset.action;

    if (action === 'toggle') {
      var el = document.getElementById(btn.dataset.section + '-section');
      if (el) {
        el.classList.toggle('collapsed');
        collapsed[btn.dataset.section] = el.classList.contains('collapsed');
      }
    } else if (action === 'open-file') {
      vsc.postMessage({ type: 'openFile', path: btn.dataset.path });
    } else if (action === 'delete-memory') {
      var id = btn.dataset.id;
      if (confirmDeleteId === id) {
        vsc.postMessage({ type: 'deleteMemory', id: id });
        confirmDeleteId = null;
        if (confirmTimer) clearTimeout(confirmTimer);
      } else {
        confirmDeleteId = id;
        if (confirmTimer) clearTimeout(confirmTimer);
        confirmTimer = setTimeout(function () { confirmDeleteId = null; renderMemory(); }, 3000);
        renderMemory();
      }
    } else if (action === 'copy-memory') {
      var mem = (state && state.memories || []).find(function (m) { return m.id === btn.dataset.id; });
      if (mem) vsc.postMessage({ type: 'copyText', text: mem.text });
    } else if (action === 'release-lock') {
      vsc.postMessage({ type: 'releaseLock', file: btn.dataset.file });
    }
  });

  document.addEventListener('input', function (e) {
    if (e.target.id === 'mem-search') {
      memSearch = e.target.value;
      renderMemory();
    }
  });

  document.addEventListener('change', function (e) {
    if (e.target.id === 'mem-filter') {
      memFilter = e.target.value;
      renderMemory();
    }
  });

  // ── Render (thin layer — all data pre-processed by extension host) ──

  function render() {
    if (!state) return;

    document.getElementById('loading').style.display = 'none';
    document.getElementById('error-display').style.display = 'none';
    document.getElementById('content').style.display = 'block';

    // Agents
    var agents = state.agents || [];
    document.getElementById('agents-count').textContent = agents.length + ' running';
    document.getElementById('agents-body').innerHTML = agents.length
      ? agents.map(renderAgent).join('')
        + (state.agentOverflow > 0 ? '<p class="empty">+ ' + state.agentOverflow + ' more</p>' : '')
      : '<p class="empty">No agents running — start an AI tool to see it here.</p>';

    // Conflicts
    var conflicts = state.conflicts || [];
    var cs = document.getElementById('conflicts-section');
    if (conflicts.length) {
      cs.style.display = 'block';
      document.getElementById('conflicts-body').innerHTML = conflicts.map(function (c) {
        return '<div class="conflict-row">' +
          '<svg class="conflict-icon" width="14" height="14" viewBox="0 0 16 16"><path d="M8 1L1 14h14L8 1z" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M8 6v4M8 11.5v.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg> ' +
          '<span class="file-link" data-action="open-file" data-path="' + escA(c.file) + '">' + esc(c.file) + '</span>' +
          ' <span class="dim">' + c.agents.map(esc).join(' & ') + '</span></div>';
      }).join('');
    } else { cs.style.display = 'none'; }

    // Locks
    var locks = state.locks || [];
    var ls = document.getElementById('locks-section');
    if (locks.length) {
      ls.style.display = 'block';
      document.getElementById('locks-body').innerHTML = locks.map(function (l) {
        return '<div class="lock-row">' +
          '<span class="file-link" data-action="open-file" data-path="' + escA(l.file_path) + '">' + esc(l.name) + '</span>' +
          '<span class="dim">' + esc(l.owner_handle) + ' · ' + l.minutes_held + 'm</span>' +
          '<button class="ghost-btn" data-action="release-lock" data-file="' + escA(l.file_path) + '">Release</button>' +
          '</div>';
      }).join('');
    } else { ls.style.display = 'none'; }

    // Messages (passive — matches TUI behavior)
    var messages = state.messages || [];
    var ms = document.getElementById('messages-section');
    if (messages.length) {
      ms.style.display = 'block';
      document.getElementById('messages-count').textContent = messages.length + (state.messageOverflow > 0 ? '+' : '');
      document.getElementById('messages-body').innerHTML = messages.map(function (m) {
        return '<div class="msg-row"><strong>' + esc(m.from) + '</strong> ' + esc(m.text) + '</div>';
      }).join('') + (state.messageOverflow > 0 ? '<p class="empty">+ ' + state.messageOverflow + ' more</p>' : '');
    } else { ms.style.display = 'none'; }

    // Memory
    renderMemory();

    // Stats (usage telemetry + tools configured — matches TUI)
    var usage = state.usage || {};
    var toolsConfigured = state.toolsConfigured || [];
    var hasStats = toolsConfigured.length > 0 || Object.keys(usage).length > 0;
    var statsSec = document.getElementById('stats-section');
    if (hasStats) {
      statsSec.style.display = 'block';
      var statsHtml = '<div class="stats-row">';
      if (usage.conflict_checks > 0) statsHtml += '<span class="dim">Checks: ' + usage.conflict_checks + '</span>';
      if (usage.conflicts_found > 0) statsHtml += '<span class="stat-warn">Found: ' + usage.conflicts_found + '</span>';
      if (usage.memories_saved > 0) statsHtml += '<span class="dim">Saved: ' + usage.memories_saved + '</span>';
      if (usage.messages_sent > 0) statsHtml += '<span class="dim">Msgs: ' + usage.messages_sent + '</span>';
      statsHtml += '</div>';
      if (toolsConfigured.length > 0) {
        statsHtml += '<div class="dim">Tools: ' + toolsConfigured.map(function (t) {
          return esc(t.tool) + ' (' + t.joins + ')';
        }).join(', ') + '</div>';
      }
      document.getElementById('stats-body').innerHTML = statsHtml;
    } else { statsSec.style.display = 'none'; }

    // Sessions (shown when no agents running, matches TUI)
    var sessions = state.sessions || [];
    var ss = document.getElementById('sessions-section');
    if (sessions.length) {
      ss.style.display = 'block';
      document.getElementById('sessions-body').innerHTML = sessions.map(function (s) {
        return '<div class="session-row">' + esc(s.toolName) +
          ' <span class="dim">' + esc(s.owner_handle) + ' · ' + (s.duration || '0m') +
          ' · ' + s.edit_count + ' edits · ' + s.file_count + ' files</span></div>';
      }).join('');
    } else { ss.style.display = 'none'; }

    // Restore collapsed states
    Object.keys(collapsed).forEach(function (key) {
      var el = document.getElementById(key + '-section');
      if (el) {
        if (collapsed[key]) el.classList.add('collapsed');
        else el.classList.remove('collapsed');
      }
    });
  }

  function renderAgent(a) {
    // All data pre-processed: toolName, duration, summary, files with names
    var h = '<div class="agent-row"><span class="dot"></span>';
    h += '<span class="tool-name">' + esc(a.toolName) + '</span>';
    if (a.showShortId && a.shortId) h += ' <span class="dim">#' + esc(a.shortId) + '</span>';
    if (state.isTeam && a.handle) h += ' <span class="dim">' + esc(a.handle) + '</span>';
    if (a.duration) h += ' <span class="dim">' + esc(a.duration) + '</span>';
    h += '</div>';
    if (a.files.length) {
      h += '<div class="agent-files">' + a.files.map(function (f) {
        return '<span class="file-link" data-action="open-file" data-path="' + escA(f.path) + '">' + esc(f.name) + '</span>';
      }).join(', ') + '</div>';
    }
    if (a.summary) {
      h += '<div class="agent-summary">"' + esc(a.summary) + '"</div>';
    }
    return h;
  }

  function renderMemory() {
    var memories = state ? (state.memories || []) : [];

    // Dynamically populate filter dropdown from tags in data
    var allTags = {};
    memories.forEach(function (m) {
      (m.tags || []).forEach(function (t) { allTags[t] = true; });
    });
    var tagList = Object.keys(allTags).sort();
    var filterEl = document.getElementById('mem-filter');
    if (filterEl) {
      var prev = filterEl.value;
      filterEl.innerHTML = '<option value="">All</option>' +
        tagList.map(function (t) { return '<option value="' + escA(t) + '">' + esc(t) + '</option>'; }).join('');
      filterEl.value = prev;
      memFilter = filterEl.value; // reset if previous tag no longer exists
    }

    // Local filtering for responsive search UX
    var filtered = memories.filter(function (m) {
      if (memFilter && (m.tags || []).indexOf(memFilter) === -1) return false;
      if (memSearch && m.text.toLowerCase().indexOf(memSearch.toLowerCase()) === -1) return false;
      return true;
    });

    document.getElementById('memory-count').textContent = memories.length + ' saved';

    if (!filtered.length) {
      document.getElementById('memory-body').innerHTML = memories.length
        ? '<p class="empty">No matches.</p>'
        : '<p class="empty">No memories yet — agents save project knowledge here.</p>';
      return;
    }

    document.getElementById('memory-body').innerHTML = filtered.map(function (m) {
      var isConfirm = confirmDeleteId === m.id;
      var tagsHtml = (m.tags || []).length
        ? m.tags.map(function (t) { return '<span class="mem-tag">' + esc(t) + '</span>'; }).join(' ')
        : '';
      return '<div class="mem-row">' +
        '<span class="mem-tags">' + tagsHtml + '</span>' +
        '<span class="mem-text">' + esc(m.text) + '</span>' +
        '<span class="mem-author dim">' + esc(m.source_handle) + '</span>' +
        '<span class="mem-actions">' +
        '<button class="icon-btn" data-action="copy-memory" data-id="' + escA(m.id) + '" title="Copy">' +
        '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="5" y="5" width="9" height="9" rx="1" stroke="currentColor" stroke-width="1.2"/><path d="M3 11V3a1 1 0 011-1h8" stroke="currentColor" stroke-width="1.2"/></svg>' +
        '</button>' +
        '<button class="icon-btn' + (isConfirm ? ' confirm-delete' : '') + '" data-action="delete-memory" data-id="' + escA(m.id) + '" title="' + (isConfirm ? 'Click again to confirm' : 'Delete') + '">' +
        (isConfirm
          ? '<span class="confirm-text">Delete?</span>'
          : '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M5.5 4V3a1 1 0 011-1h3a1 1 0 011 1v1M6 7v5M10 7v5M4 4l.8 9a1 1 0 001 .9h4.4a1 1 0 001-.9L12 4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        ) +
        '</button>' +
        '</span></div>';
    }).join('');
  }
})();
