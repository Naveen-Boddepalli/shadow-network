import { useState, useEffect, useCallback } from 'react';
import { getAllNotes, deleteNote as apiDelete } from '../services/api';

export const useNotes = ({ subject, page, limit } = {}) => {
  const [notes, setNotes]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [pagination, setPagination] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getAllNotes({ subject: subject || undefined, page, limit });
      setNotes(res.data || []);
      setPagination(res.pagination || {});
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [subject, page, limit]);

  useEffect(() => { load(); }, [load]);

  const remove = async (id) => {
    await apiDelete(id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
    setPagination((p) => (p.total ? { ...p, total: p.total - 1 } : p));
  };

  return { notes, loading, error, pagination, refetch: load, remove };
};
