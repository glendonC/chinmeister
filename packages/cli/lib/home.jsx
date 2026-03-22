import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { api } from './api.js';
import { getInkColor } from './colors.js';
import { getTimeAgo } from './time.js';

export function Home({ user, config, navigate }) {
  const [stats, setStats] = useState({ online: 0, notesToday: 0 });
  const [posted, setPosted] = useState(false);
  const [inbox, setInbox] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const client = api(config);

      try { await client.post('/presence/heartbeat', {}); } catch {}

      try {
        const s = await client.get('/stats');
        setStats(s);
      } catch {}

      try {
        const result = await client.get('/notes/inbox');
        if (result.locked) {
          setPosted(false);
          setInbox(null);
        } else if (result.waiting) {
          setPosted(true);
          setInbox('waiting');
        } else {
          setPosted(true);
          setInbox({ from: result.from, note: result.note });
        }
      } catch {}

      setLoading(false);
    }
    load();

    const interval = setInterval(async () => {
      try {
        await api(config).post('/presence/heartbeat', {});
        const s = await api(config).get('/stats');
        setStats(s);
      } catch {}
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  useInput((ch) => {
    if (loading) return;
    if (ch === 'w' && !posted) { navigate('post'); return; }
    if (ch === 'f') { navigate('feed'); return; }
    if (ch === 'c') { navigate('chat'); return; }
    if (ch === 's') { navigate('customize'); return; }
    if (ch === 'q') { navigate('quit'); return; }
  });

  if (loading) {
    return (
      <Box padding={1}>
        <Text dimColor>Loading...</Text>
      </Box>
    );
  }

  const parts = [];
  if (stats.notesToday) {
    parts.push(`${stats.notesToday} note${stats.notesToday !== 1 ? 's' : ''} today`);
  }
  if (stats.online >= 10) {
    parts.push(`${stats.online} devs online`);
  } else if (stats.online >= 1) {
    parts.push('a few devs online');
  }
  const statsLine = parts.join(' · ');

  const hasExchange = inbox && typeof inbox === 'object';
  const isWaiting = inbox === 'waiting';

  const actions = [];
  if (!posted) actions.push('[w] write');
  actions.push('[f] feed');
  actions.push('[c] chat');
  actions.push('[s] settings');
  actions.push('[q] quit');

  return (
    <Box flexDirection="column" paddingX={1}>
      {statsLine && (
        <>
          <Text>{''}</Text>
          <Text dimColor>{statsLine}</Text>
        </>
      )}

      <Text>{''}</Text>

      {!posted && (
        <Text>Write today's note — post one, get one back.</Text>
      )}

      {isWaiting && (
        <Text dimColor>Posted. Waiting for a note back.</Text>
      )}

      {hasExchange && (
        <Box
          flexDirection="column"
          paddingX={1}
          borderStyle="round"
          borderColor="green"
        >
          <Box>
            <Text color={getInkColor(inbox.from.color)} bold>{inbox.from.handle}</Text>
            <Text dimColor> · {getTimeAgo(inbox.note.created_at)}</Text>
          </Box>
          <Text>{inbox.note.message}</Text>
        </Box>
      )}

      <Text>{''}</Text>
      <Text dimColor>{actions.join('  ')}</Text>
    </Box>
  );
}
