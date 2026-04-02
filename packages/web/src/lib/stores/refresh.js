const refreshSubscribers = new Set();

export function addRefreshHandler(handler) {
  refreshSubscribers.add(handler);
  return () => refreshSubscribers.delete(handler);
}

// Legacy single-handler API — delegates to subscriber set
export function setRefreshHandler(handler) {
  refreshSubscribers.add(handler);
}

export function requestRefresh() {
  for (const handler of refreshSubscribers) {
    handler();
  }
}
