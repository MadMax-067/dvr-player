"use client";
import DvrPlayer from "@/components/DvrPlayer";
import { useEffect, useMemo, useState } from "react";

export default function Home() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchFiles = async (day) => {
    try {
      setLoading(true);
      setError(null);
      const url = `/api/files?cam=cam3&date=${encodeURIComponent(day)}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setFiles(Array.isArray(data.files) ? data.files : []);
    } catch (e) {
      setError(e.message || String(e));
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles(date);
  }, [date]);

  return (
    <main style={{ padding: 20 }}>
      <h1>DVR Player Demo</h1>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <label>
          Day:
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <button onClick={() => fetchFiles(date)} disabled={loading}>Reload</button>
        {loading && <span>Loading…</span>}
        {error && <span style={{ color: 'red' }}>{error}</span>}
      </div>
      <DvrPlayer files={files} />
    </main>
  );
}
