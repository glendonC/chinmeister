import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { api } from './api.js';
import { getInkColor } from './colors.js';
import { getTimeAgo } from './time.js';

export function Community({ config, navigate }) {
  const [notes, setNotes] = useState([]);
  const [posted, setPosted] = useState(false);
  const [inbox, setInbox] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scrollIdx, setScrollIdx] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [pageCursor, setPageCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    async function load() {
      const client = api(config);

      try {
        const result = await client.get('/notes/today?limit=20');
        setNotes(result.notes || []);
        setPageCursor(result.cursor || null);
        setHasMore(!!result.cursor);
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
      try { await api(config).post('/presence/heartbeat', {}); } catch {}
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  async function loadMore() {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ limit: '20' });
      if (pageCursor) params.set('cursor', pageCursor);
      const result = await api(config).get(`/notes/today?${params}`);
      setNotes(prev => [...prev, ...(result.notes || [])]);
      setPageCursor(result.cursor || null);
      setHasMore(!!result.cursor);
    } catch {}
    setLoadingMore(false);
  }

  useInput((ch, key) => {
    if (key.escape) { navigate('home'); return; }
    if (ch === 'w' && !posted) { navigate('post'); return; }
    if (ch === 'c') { navigate('chat'); return; }

    if (key.upArrow) {
      setScrollIdx(prev => Math.max(0, prev - 1));
    }
    if (key.downArrow && notes.length > 0) {
      setScrollIdx(prev => {
        const next = prev + 1;
        if (next >= notes.length - 3 && hasMore && !loadingMore) {
          loadMore();
        }
        return Math.min(notes.length - 1, next);
      });
    }
  });

  if (loading) {
    return (
      <Box padding={1}>
        <Text dimColor>Loading...</Text>
      </Box>
    );
  }

  const hasExchange = inbox && typeof inbox === 'object';
  const isWaiting = inbox === 'waiting';

  const windowSize = 8;
  const start = Math.max(0, scrollIdx - Math.floor(windowSize / 2));
  const visible = notes.slice(start, start + windowSize);

  const actions = [];
  if (!posted) actions.push('[w] write');
  actions.push('[c] chat');
  actions.push('[↑↓] scroll');
  actions.push('[esc] back');

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text>{''}</Text>

      {!posted && (
        <>
          <Text>Write today's note — post one, get one back.</Text>
          <Text>{''}</Text>
        </>
      )}

      {isWaiting && (
        <>
          <Text dimColor>Posted. Waiting for a note back.</Text>
          <Text>{''}</Text>
        </>
      )}

      {hasExchange && (
        <>
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
          <Text>{''}</Text>
        </>
      )}

      {notes.length === 0 ? (
        <Text dimColor>No notes today yet. Be the first.</Text>
      ) : (
        <>
          {visible.map((note, i) => {
            const isSelected = start + i === scrollIdx;
            return (
              <Box key={note.id} flexDirection="column" marginBottom={1}>
                <Box>
                  <Text>{isSelected ? '▸' : ' '} </Text>
                  <Text color={getInkColor(note.color)} bold>{note.handle}</Text>
                  <Text dimColor> · {getTimeAgo(note.created_at)}</Text>
                </Box>
                <Text>  {note.message}</Text>
              </Box>
            );
          })}
          {hasMore && <Text dimColor>  ↓ more</Text>}
        </>
      )}

      <Text>{''}</Text>
      <Text dimColor>{actions.join('  ')}</Text>
    </Box>
  );
}
