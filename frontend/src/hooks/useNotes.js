// src/hooks/useNotes.js
import { useState, useEffect, useCallback } from 'react';
import { getAllNotes, deleteNote as apiDelete } from '../services/api';

export const useNotes = (params = {}) => {
  const [notes, setNotes]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [pagination, setPagination] = useState({});

  const fetch = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await getAllNotes(params);
      setNotes(res.data || []);
      setPagination(res.pagination || {});
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [JSON.stringify(params)]);   // eslint-disable-line

  useEffect(() => { fetch(); }, [fetch]);

  const remove = async (id) => {
    await apiDelete(id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
  };

  return { notes, loading, error, pagination, refetch: fetch, remove };
};
