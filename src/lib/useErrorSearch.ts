import { useState, useEffect, useMemo } from 'react';

/**
 * Manages a case-insensitive substring filter over a list of strings.
 * Resets the query whenever `open` changes (handles "clear on reopen").
 */
export function useErrorSearch(items: string[], open: boolean) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    setQuery('');
  }, [open]);

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter((item) => item.toLowerCase().includes(q));
  }, [items, query]);

  return { query, setQuery, filtered };
}
