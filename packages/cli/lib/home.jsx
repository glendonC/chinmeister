import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { api } from './api.js';

export function Home({ user, config, navigate }) {
  const [stats, setStats] = useState({ online: 0, notesToday: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const client = api(config);
      try { await client.post('/presence/heartbeat', {}); } catch {}
      try {
        const s = await client.get('/stats');
        setStats(s);
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
    if (ch === 'c') { navigate('community'); return; }
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
  if (stats.online >= 10) {
    parts.push(`${stats.online} devs online`);
  } else if (stats.online >= 1) {
    parts.push('a few devs online');
  }
  if (stats.notesToday) {
    parts.push(`${stats.notesToday} note${stats.notesToday !== 1 ? 's' : ''} today`);
  }
  const statsLine = parts.join(' · ');

  return (
    <Box flexDirection="column">
      <Box
        flexDirection="column"
        paddingX={2}
        borderStyle="round"
        borderColor="gray"
      >
        <Text bold>chinwag</Text>
        <Text dimColor>your dev home in the terminal</Text>
        {statsLine && (
          <>
            <Text>{''}</Text>
            <Text dimColor>{statsLine}</Text>
          </>
        )}
      </Box>

      {stats.announcement && (
        <Box paddingX={1} paddingTop={1}>
          <Text dimColor>{stats.announcement}</Text>
        </Box>
      )}

      <Box paddingX={1} paddingTop={1}>
        <Text dimColor>[c] community  [s] settings  [q] quit</Text>
      </Box>
    </Box>
  );
}
