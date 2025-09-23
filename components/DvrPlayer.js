"use client";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import videojs from "video.js";
import "video.js/dist/video-js.css";
import "videojs-playlist";


function pillBtn(active = false) {
  return {
    padding: "6px 12px",
    borderRadius: 9999,
    border: `1px solid ${active ? '#22c55e' : '#2a2f36'}`,
    background: active ? '#16351f' : '#111418',
    color: active ? '#d1fae5' : '#e5e7eb',
    fontSize: 13,
    lineHeight: 1,
    cursor: 'pointer',
    transition: 'background 0.15s ease, border-color 0.15s ease',
  };
}

function pillText() {
  return {
    padding: "6px 12px",
    borderRadius: 9999,
    border: '1px solid #2a2f36',
    background: '#0b0e12',
    color: '#9ca3af',
    fontSize: 13,
    lineHeight: 1,
  };
}

function pillInput(width) {
  return {
    padding: "6px 10px",
    borderRadius: 9999,
    border: '1px solid #2a2f36',
    background: '#0b0e12',
    color: '#e5e7eb',
    fontSize: 13,
    lineHeight: 1,
    width: width ? `${width}px` : undefined,
  };
}

export default function DvrPlayer({ files }) {
  const playerRef = useRef(null);
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const timelineRef = useRef(null);
  const [error, setError] = useState(null);
  const [currentItem, setCurrentItem] = useState(0);
  const [segCurrentTime, setSegCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [clipRange, setClipRange] = useState({ start: null, end: null }); 
  const hasPlaylistRef = useRef(false);
  const zoomRef = useRef(1);
  const rateRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const pinchStartRef = useRef({ dist: 0, scale: 1, mid: { x: 0, y: 0 } });
  const lastPanPosRef = useRef(null);
  const lastTapRef = useRef({ time: 0, x: 0, y: 0 });
  const [rate, setRate] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [jumpDate, setJumpDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [jumpTime, setJumpTime] = useState('06:00:00');
  
  const [tlPps, setTlPps] = useState(2); 
  const [tlViewportW, setTlViewportW] = useState(0);
  const scrubbingRef = useRef(null); 

  const parseStartMs = (s) => {
    const d = new Date(s.replace(" ", "T"));
    return d.getTime();
  };

  const segments = useMemo(() => {
    if (!files || files.length === 0) return [];
    const getRelPath = (f) => {
      if (f.url) return f.url.replace(/^\/+/, '');
      if (f.url_full) {
        const marker = '/camera/_test/playback/';
        const idx = f.url_full.indexOf(marker);
        if (idx !== -1) return f.url_full.slice(idx + marker.length);
        try {
          const u = new URL(f.url_full);
          return u.pathname.replace(/^\/+/, '');
        } catch {
          return f.url_full;
        }
      }
      return '';
    };
    const arr = files
      .map((f, i) => ({
        index: i,
        startMs: parseStartMs(f.start),
        url: `/api/segment?path=${encodeURIComponent(getRelPath(f))}`,
        filename: f.filename,
      }))
      .sort((a, b) => a.startMs - b.startMs);
    for (let i = 0; i < arr.length; i++) {
      const next = arr[i + 1];
      const dur = next ? Math.max(1, Math.round((next.startMs - arr[i].startMs) / 1000)) : 60; 
      arr[i].duration = dur;
    }
    return arr;
  }, [files]);

  const baseStartMs = segments.length ? segments[0].startMs : null;
  const globalDuration = useMemo(() => segments.reduce((s, x) => s + (x.duration || 0), 0), [segments]);

  
  const segmentsAcc = useMemo(() => {
    let acc = 0;
    return segments.map((s) => {
      const out = { ...s, accStartSec: acc };
      acc += s.duration || 0;
      return out;
    });
  }, [segments]);

  const formatClock = (ms) => {
    if (!ms && ms !== 0) return "--:--:--";
    const d = new Date(ms);
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  const formatDateTime = (ms) => {
    const d = new Date(ms);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    const hh = String(h).padStart(2, '0');
    return `${dd}/${mm}/${yyyy}, ${hh}:${m}:${s}`;
  };

  const getGlobalTime = () => {
    const prior = segments.slice(0, currentItem).reduce((s, x) => s + x.duration, 0);
    return prior + segCurrentTime;
  };

  const globalToLocal = (gSec) => {
    let acc = 0;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (gSec < acc + seg.duration) {
        return { index: i, offset: Math.max(0, gSec - acc) };
      }
      acc += seg.duration;
    }
    const last = segments[segments.length - 1];
    return { index: segments.length - 1, offset: Math.max(0, last.duration - 0.1) };
  };

  useEffect(() => {
    const init = () => {
      if (playerRef.current || !videoRef.current) return;
      const player = videojs(videoRef.current, {
        controls: false,
        preload: "auto",
        width: 640,
        height: 360,
        fluid: true,
        html5: {
          playsinline: true,
          nativeAudioTracks: false,
          nativeVideoTracks: false,
          nativeTextTracks: false,
        },
      });
      playerRef.current = player;

      player.ready(() => {
        const techEl = player.tech(true)?.el?.();
        const v = techEl || player.el().getElementsByTagName('video')[0];
        if (v) {
          v.setAttribute('playsinline', '');
          v.setAttribute('webkit-playsinline', '');
          v.setAttribute('disablepictureinpicture', '');
          v.setAttribute('controlsList', 'nodownload noplaybackrate noremoteplayback nofullscreen');
          v.setAttribute('disableremoteplayback', '');
          v.style.transformOrigin = 'center center';
        }
      });

      player.on('error', () => {
        const err = player.error();
        let msg = 'An error occurred during video playback.';
        if (err) {
          if (err.code === 3) msg = 'Cannot play this video. The file may be corrupted or use unsupported codecs.';
          else if (err.code === 4) msg = 'The video could not be loaded. Please check the video URL or network connection.';
        }
        setError(msg);
      });

      player.on('play', () => setIsPlaying(true));
      player.on('pause', () => setIsPlaying(false));
      player.on('timeupdate', () => setSegCurrentTime(player.currentTime() || 0));
      player.on('loadedmetadata', () => {
        
        const videoEl = player.el().getElementsByTagName('video')[0];
        if (videoEl) {
          applyTransform(videoEl);
        }
        
        if (rateRef.current && typeof player.playbackRate === 'function') {
          player.playbackRate(rateRef.current);
        }
      });
      player.on('playlistitem', () => {
        if (hasPlaylistRef.current) {
          const idx = player.playlist.currentItem();
          setCurrentItem(idx ?? 0);
          setSegCurrentTime(0);
          
          if (rateRef.current && typeof player.playbackRate === 'function') {
            player.playbackRate(rateRef.current);
          }
        }
      });
    };

    if (videoRef.current && videoRef.current.isConnected) init();
    else setTimeout(init, 0);

    return () => {
      if (playerRef.current) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  }, [applyTransform]);

  
  const secToX = (sec) => sec * tlPps;
  const xToSec = (x) => x / tlPps;
  const clampSec = (s) => Math.max(0, Math.min(globalDuration, s));

  const getRulerScale = (pps) => {
    if (pps >= 100) return { major: 1, minor: 0.2 };
    if (pps >= 60) return { major: 1, minor: 0.5 };
    if (pps >= 30) return { major: 5, minor: 1 };
    if (pps >= 10) return { major: 10, minor: 2 };
    if (pps >= 4) return { major: 30, minor: 5 };
    if (pps >= 1) return { major: 60, minor: 10 };
    if (pps >= 0.2) return { major: 300, minor: 60 };
    return { major: 600, minor: 120 };
  };

  
  useEffect(() => {
    const el = timelineRef.current;
    if (!el) return;
    const onResize = () => setTlViewportW(el.clientWidth || 0);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const zoomTimeline = (mult, anchorSec) => {
    const el = timelineRef.current;
    if (!el) return;
    const old = tlPps;
    const next = Math.max(0.05, Math.min(200, old * mult));
    if (next === old) return;
    
    const rect = el.getBoundingClientRect();
    const playheadSec = anchorSec != null ? anchorSec : getGlobalTime();
    const anchorX = secToX(playheadSec) - el.scrollLeft; 
    setTlPps(next);
    
    requestAnimationFrame(() => {
      const newAnchorX = playheadSec * next - el.scrollLeft;
      const delta = newAnchorX - anchorX;
      el.scrollLeft += delta;
    });
  };

  const zoomTimelineToFit = () => {
    const el = timelineRef.current;
    if (!el || !globalDuration) return;
    const margin = 40;
    const target = Math.max(0.05, (el.clientWidth - margin) / globalDuration);
    setTlPps(target);
    el.scrollLeft = 0;
  };

  const onTimelineWheel = (e) => {
    const el = timelineRef.current;
    if (!el) return;
    if (e.ctrlKey) {
      e.preventDefault();
      const mult = Math.exp(-e.deltaY * 0.001);
      
      const rect = el.getBoundingClientRect();
      const cursorX = e.clientX - rect.left + el.scrollLeft;
      const cursorSec = xToSec(cursorX);
      const old = tlPps;
      const next = Math.max(0.05, Math.min(200, old * mult));
      if (next === old) return;
      setTlPps(next);
      requestAnimationFrame(() => {
        const newX = cursorSec * next;
        el.scrollLeft = Math.max(0, newX - (e.clientX - rect.left));
      });
    }
  };

  const onTimelineMouseDown = (e) => {
    const el = timelineRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const innerX = e.clientX - rect.left + el.scrollLeft;
    const sec = clampSec(xToSec(innerX));
    
    const handlePx = 6;
    const startSec = clipRange.start ?? null;
    const endSec = clipRange.end ?? null;
    const isNear = (a, bSec) => bSec != null && Math.abs(secToX(bSec) - innerX) <= handlePx;
    if (isNear(innerX, startSec)) scrubbingRef.current = 'clip-start';
    else if (isNear(innerX, endSec)) scrubbingRef.current = 'clip-end';
    else scrubbingRef.current = 'playhead';

    const onMove = (ev) => {
      const x = ev.clientX - rect.left + el.scrollLeft;
      const s = clampSec(xToSec(x));
      if (scrubbingRef.current === 'playhead') {
        seekToGlobal(s);
      } else if (scrubbingRef.current === 'clip-start') {
        setClipRange((r) => ({ ...r, start: s }));
      } else if (scrubbingRef.current === 'clip-end') {
        setClipRange((r) => ({ ...r, end: s }));
      }
    };
    const onUp = () => {
      scrubbingRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    
    if (scrubbingRef.current === 'playhead') seekToGlobal(sec);
  };

  
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  const constrainPan = useCallback((videoEl, scale, pan) => {
    const container = containerRef.current;
    if (!container) return pan;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const vw = videoEl.clientWidth;
    const vh = videoEl.clientHeight;
    const scaledW = vw * scale;
    const scaledH = vh * scale;
    const maxX = Math.max(0, (scaledW - cw) / 2);
    const maxY = Math.max(0, (scaledH - ch) / 2);
    return { x: clamp(pan.x, -maxX, maxX), y: clamp(pan.y, -maxY, maxY) };
  }, []);

  const applyTransform = useCallback((videoElParam) => {
    const v = videoElParam || playerRef.current?.el().getElementsByTagName('video')[0];
    if (!v) return;
    const scale = zoomRef.current;
    const nextPan = constrainPan(v, panRef.current);
    panRef.current = nextPan;
    v.style.transformOrigin = 'center center';
    v.style.transform = `translate(${nextPan.x}px, ${nextPan.y}px) scale(${scale})`;
  }, [constrainPan]);

  
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const getDist = (t0, t1) => {
      const dx = t1.clientX - t0.clientX;
      const dy = t1.clientY - t0.clientY;
      return Math.hypot(dx, dy);
    };
    const getMid = (t0, t1) => ({ x: (t0.clientX + t1.clientX) / 2, y: (t0.clientY + t1.clientY) / 2 });

    const onTouchStart = (e) => {
      if (e.touches.length === 2) {
        const d = getDist(e.touches[0], e.touches[1]);
        const mid = getMid(e.touches[0], e.touches[1]);
        pinchStartRef.current = { dist: d, scale: zoomRef.current, mid };
      } else if (e.touches.length === 1) {
        const t = e.touches[0];
        const now = Date.now();
        const last = lastTapRef.current;
        
        if (now - last.time < 300 && Math.hypot(t.clientX - last.x, t.clientY - last.y) < 20) {
          zoomRef.current = 1;
          panRef.current = { x: 0, y: 0 };
          applyTransform();
        }
        lastTapRef.current = { time: now, x: t.clientX, y: t.clientY };
        lastPanPosRef.current = { x: t.clientX, y: t.clientY };
      }
    };

    const onTouchMove = (e) => {
      const player = playerRef.current;
      const videoEl = player?.el().getElementsByTagName('video')[0];
      if (!videoEl) return;
      if (e.touches.length === 2) {
        e.preventDefault();
        const start = pinchStartRef.current;
        if (!start.dist) return;
        const d = getDist(e.touches[0], e.touches[1]);
        const scale = clamp(start.scale * (d / start.dist), 1, 6);
        zoomRef.current = scale;
        
        const mid = getMid(e.touches[0], e.touches[1]);
        const dx = mid.x - start.mid.x;
        const dy = mid.y - start.mid.y;
        panRef.current = { x: panRef.current.x + dx, y: panRef.current.y + dy };
        pinchStartRef.current.mid = mid;
        applyTransform(videoEl);
      } else if (e.touches.length === 1) {
        if (zoomRef.current > 1 && lastPanPosRef.current) {
          e.preventDefault();
          const t = e.touches[0];
          const dx = t.clientX - lastPanPosRef.current.x;
          const dy = t.clientY - lastPanPosRef.current.y;
          panRef.current = { x: panRef.current.x + dx, y: panRef.current.y + dy };
          lastPanPosRef.current = { x: t.clientX, y: t.clientY };
          applyTransform(videoEl);
        }
      }
    };

    const onTouchEnd = () => {
      if (lastPanPosRef.current) lastPanPosRef.current = null;
      
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [applyTransform]);

  
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    if (!segments || !segments.length) return;

    hasPlaylistRef.current = typeof player.playlist === 'function';
    if (hasPlaylistRef.current) {
      const playlist = segments.map((seg) => ({
        sources: [{ src: seg.url, type: "video/mp4" }],
        startTime: seg.startMs,
      }));
      player.playlist(playlist);
      player.playlist.autoadvance(0);
      setCurrentItem(player.playlist.currentItem() ?? 0);
      
      if (rateRef.current && typeof player.playbackRate === 'function') {
        player.playbackRate(rateRef.current);
      }
    } else {
      setCurrentItem(0);
      player.src({ src: segments[0].url, type: 'video/mp4' });
      if (rateRef.current && typeof player.playbackRate === 'function') {
        player.playbackRate(rateRef.current);
      }
      player.off('ended');
      player.on('ended', () => {
        setSegCurrentTime(0);
        setCurrentItem((idx) => {
          const next = Math.min(idx + 1, segments.length - 1);
          if (next !== idx) {
            player.one('loadedmetadata', () => {
              if (rateRef.current && typeof player.playbackRate === 'function') {
                player.playbackRate(rateRef.current);
              }
              if (!player.paused()) player.play();
            });
            player.src({ src: segments[next].url, type: 'video/mp4' });
          }
          return next;
        });
      });
    }
    setError(null);
  }, [segments]);

  const seekToGlobal = (gSec) => {
    if (!playerRef.current || segments.length === 0) return;
    const clamped = Math.max(0, Math.min(globalDuration - 0.01, gSec));
    const { index, offset } = globalToLocal(clamped);
    const player = playerRef.current;
    if (hasPlaylistRef.current) {
      const current = player.playlist.currentItem();
      if (current !== index) {
        player.playlist.currentItem(index);
        const onLoaded = () => {
          if (rateRef.current && typeof player.playbackRate === 'function') {
            player.playbackRate(rateRef.current);
          }
          player.currentTime(offset);
          player.off('loadedmetadata', onLoaded);
        };
        player.on('loadedmetadata', onLoaded);
      } else {
        player.currentTime(offset);
      }
    } else {
      if (currentItem !== index) {
        setCurrentItem(index);
        const onLoaded = () => {
          if (rateRef.current && typeof player.playbackRate === 'function') {
            player.playbackRate(rateRef.current);
          }
          player.currentTime(offset);
          player.off('loadedmetadata', onLoaded);
          if (isPlaying) player.play();
        };
        player.one('loadedmetadata', onLoaded);
        player.src({ src: segments[index].url, type: 'video/mp4' });
      } else {
        player.currentTime(offset);
      }
    }
  };

  const skip = (seconds) => {
    const now = getGlobalTime();
    seekToGlobal(now + seconds);
  };

  const changeRate = (rate) => {
    const player = playerRef.current;
  rateRef.current = rate;
  setRate(rate);
  if (player && typeof player.playbackRate === 'function') player.playbackRate(rate);
  };

  const screenshot = () => {
    const player = playerRef.current;
    if (!player) return;
    const videoEl = player.el().getElementsByTagName("video")[0];
    const canvas = document.createElement("canvas");
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    const dataURL = canvas.toDataURL("image/png");

    const globalSec = getGlobalTime();
    const tsMs = baseStartMs != null ? baseStartMs + globalSec * 1000 : Date.now();
    const tsStr = new Date(tsMs).toISOString().replace(/[:.]/g, "-");
    const link = document.createElement("a");
    link.href = dataURL;
    link.download = `screenshot_${tsStr}.png`;
    link.click();
  };

  const zoom = (direction) => {
    const player = playerRef.current;
    if (!player) return;
    const videoEl = player.el().getElementsByTagName('video')[0];
    if (!videoEl) return;
  if (direction === 'in') zoomRef.current = Math.min(6, zoomRef.current + 0.2);
  else zoomRef.current = Math.max(1, zoomRef.current - 0.2);
  applyTransform(videoEl);
  };

  const setClipPoint = (type) => {
    const g = getGlobalTime();
    setClipRange((r) => {
      const next = { ...r, [type]: g };
      if (next.start != null && next.end != null && next.end < next.start) {
        return { start: next.end, end: next.start };
      }
      return next;
    });
  };

  const downloadClipManifest = () => {
    if (clipRange.start == null || clipRange.end == null || !segments.length) return;
    const start = Math.max(0, Math.min(clipRange.start, clipRange.end));
    const end = Math.min(globalDuration, Math.max(clipRange.start, clipRange.end));
    let acc = 0;
    const parts = [];
    for (const seg of segments) {
      const segStart = acc;
      const segEnd = acc + seg.duration;
      const ovStart = Math.max(start, segStart);
      const ovEnd = Math.min(end, segEnd);
      if (ovEnd > ovStart) {
        parts.push({
          url: seg.url,
          filename: seg.filename,
          startOffsetSec: Math.round(ovStart - segStart),
          durationSec: Math.round(ovEnd - ovStart),
          segmentStartWallClockMs: seg.startMs,
        });
      }
      acc = segEnd;
    }
    const manifest = {
      clipStartWallClockMs: baseStartMs + start * 1000,
      clipEndWallClockMs: baseStartMs + end * 1000,
      parts,
      note: "Client-side manifest for clip assembly. Merge server-side or with ffmpeg.wasm.",
    };
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'clip-manifest.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
  <div
        ref={containerRef}
        className="zoom-container"
        style={{ overflow: "hidden", touchAction: 'none', userSelect: 'none' }}
      >
        <video
          ref={videoRef}
          className="video-js vjs-default-skin"
          crossOrigin="anonymous"
          playsInline
          webkit-playsinline="true"
          disablePictureInPicture
          controlsList="nodownload noplaybackrate noremoteplayback nofullscreen"
        />
      </div>
  {error && (
        <div style={{ color: 'red', marginTop: 10, fontWeight: 'bold' }}>{error}</div>
      )}
      {/* Controls bar like the reference image */}
      <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button style={pillBtn()} onClick={() => { const p = playerRef.current; if (!p) return; p.play(); }}>Play</button>
  <button style={pillBtn()} onClick={() => { const p = playerRef.current; if (!p) return; p.pause(); }}>Pause</button>
  <button style={pillBtn()} onClick={() => skip(-10)}>−10s</button>
  <button style={pillBtn()} onClick={() => skip(10)}>+10s</button>
        <span style={pillText()}>{baseStartMs != null ? formatDateTime(baseStartMs + getGlobalTime() * 1000) : '--/--/---- --:--:--'}</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {[0.5, 1, 1.5, 2, 3].map((r) => (
            <button key={r} style={pillBtn(r === rate)} onClick={() => changeRate(r)}>
              {r}x
            </button>
          ))}
        </div>
  <button style={pillBtn()} onClick={screenshot}>Screenshot</button>
        {/* Date + time + Jump */}
        <input
          type="date"
          value={jumpDate}
          onChange={(e) => setJumpDate(e.target.value)}
          style={pillInput()}
        />
        <input
          type="time"
          step="1"
          value={jumpTime}
          onChange={(e) => setJumpTime(e.target.value)}
          style={pillInput(100)}
        />
        <button
          style={pillBtn()}
          onClick={() => {
            if (!baseStartMs) return;
            try {
              const [hh, mm, ss] = jumpTime.split(':').map((x) => parseInt(x, 10));
              const d = new Date(jumpDate + 'T00:00:00');
              d.setHours(hh || 0, mm || 0, ss || 0, 0);
              const dayStart = new Date(new Date(baseStartMs).toDateString()).getTime();
              const targetMs = d.getTime();
              
              const clampedMs = Math.min(dayStart + 24*3600*1000 - 1, Math.max(dayStart, targetMs));
              const gSec = (clampedMs - baseStartMs) / 1000;
              seekToGlobal(gSec);
            } catch {}
          }}
        >
          Jump
        </button>
      </div>

      {/* Editor-style timeline (zoomable, scrubbable) */}
      {globalDuration > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={pillText()}>Timeline</span>
            <button style={pillBtn()} onClick={() => zoomTimeline(0.8)}>TL −</button>
            <button style={pillBtn()} onClick={() => zoomTimeline(1.25)}>TL +</button>
            <button style={pillBtn()} onClick={zoomTimelineToFit}>Fit</button>
          </div>
          <div
            ref={timelineRef}
            onWheel={onTimelineWheel}
            style={{ position: 'relative', height: 110, overflowX: 'auto', overflowY: 'hidden', background: '#0b0e12', border: '1px solid #23262b', borderRadius: 8 }}
          >
            <div
              onMouseDown={onTimelineMouseDown}
              style={{ position: 'relative', width: `${Math.max(secToX(globalDuration), tlViewportW)}px`, height: '100%' }}
            >
              {/* RULER */}
              <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 28, borderBottom: '1px solid #1a1e24' }}>
                {(() => {
                  const { major } = getRulerScale(tlPps);
                  const ticks = [];
                  for (let s = 0; s <= globalDuration; s += major) {
                    const x = secToX(s);
                    const labelMs = baseStartMs != null ? baseStartMs + s * 1000 : null;
                    ticks.push(
                      <div key={`t-${s}`} style={{ position: 'absolute', left: x, top: 0, bottom: 0, width: 1 }}>
                        <div style={{ position: 'absolute', left: 0, top: 0, width: 1, height: 12, background: '#39404a' }} />
                        <div style={{ position: 'absolute', left: 4, top: 12, color: '#9ca3af', fontSize: 11 }}>
                          {labelMs != null ? formatClock(labelMs) : `${s.toFixed(0)}s`}
                        </div>
                      </div>
                    );
                  }
                  return ticks;
                })()}
              </div>

              {/* SEGMENTS lane */}
              <div style={{ position: 'absolute', left: 0, right: 0, top: 28, height: 36 }}>
                {segmentsAcc.map((seg, i) => (
                  <div key={`seg-${i}`} style={{ position: 'absolute', left: secToX(seg.accStartSec), top: 8, height: 20, width: secToX(seg.duration), background: '#1f5a36', border: '1px solid #2fb46e', borderRadius: 4 }} />
                ))}
              </div>

              {/* CLIP selection overlay */}
              {clipRange.start != null && clipRange.end != null && (
                (() => {
                  const a = Math.min(clipRange.start, clipRange.end);
                  const b = Math.max(clipRange.start, clipRange.end);
                  const left = secToX(a);
                  const width = secToX(b - a);
                  return (
                    <div style={{ position: 'absolute', left, top: 28, height: 36, width, background: 'rgba(34,197,94,0.15)', border: '1px solid #22c55e' }}>
                      {/* handles */}
                      <div style={{ position: 'absolute', left: -3, top: 0, bottom: 0, width: 6, background: '#22c55e', cursor: 'ew-resize' }} />
                      <div style={{ position: 'absolute', right: -3, top: 0, bottom: 0, width: 6, background: '#22c55e', cursor: 'ew-resize' }} />
                    </div>
                  );
                })()
              )}

              {/* PLAYHEAD */}
              <div style={{ position: 'absolute', left: secToX(getGlobalTime()), top: 0, bottom: 0, width: 2, background: '#ef4444' }} />
            </div>
          </div>
        </div>
      )}

      {segments.length > 0 && (() => {
        const dayStart = new Date(new Date(segments[0].startMs).toDateString()).getTime();
        const dayEnd = dayStart + 24 * 3600 * 1000;
        const avails = segments.map((s) => ({ start: s.startMs, end: s.startMs + s.duration * 1000 }));
        avails.sort((a, b) => a.start - b.start);
        const merged = [];
        for (const iv of avails) {
          if (!merged.length || iv.start > merged[merged.length - 1].end) merged.push({ ...iv });
          else merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, iv.end);
        }
        const onPos = (clientX, rect) => {
          const ratio = (clientX - rect.left) / rect.width;
          const targetMs = dayStart + ratio * (dayEnd - dayStart);
          const gSec = (targetMs - baseStartMs) / 1000;
          seekToGlobal(gSec);
        };
        return (
          <div style={{ marginTop: 10 }}>
            <div
              style={{ position: 'relative', height: 56, background: '#111418', borderRadius: 8, padding: 10, border: '1px solid #23262b' }}
              onMouseDown={(e) => { setDragging(true); onPos(e.clientX, e.currentTarget.getBoundingClientRect()); }}
              onMouseMove={(e) => { if (dragging) onPos(e.clientX, e.currentTarget.getBoundingClientRect()); }}
              onMouseUp={() => setDragging(false)}
              onMouseLeave={() => setDragging(false)}
              onTouchStart={(e) => { const rect = e.currentTarget.getBoundingClientRect(); if (e.touches[0]) onPos(e.touches[0].clientX, rect); setDragging(true); }}
              onTouchMove={(e) => { const rect = e.currentTarget.getBoundingClientRect(); if (e.touches[0] && dragging) onPos(e.touches[0].clientX, rect); }}
              onTouchEnd={() => setDragging(false)}
            >
              {/* availability bar */}
              <div style={{ position: 'absolute', left: 10, right: 10, top: 18, height: 12, background: '#2a2f36', borderRadius: 6, overflow: 'hidden' }}>
                {merged.map((iv, i) => {
                  const leftPct = ((iv.start - dayStart) / (dayEnd - dayStart)) * 100;
                  const widthPct = ((iv.end - iv.start) / (dayEnd - dayStart)) * 100;
                  return (
                    <div key={i} style={{ position: 'absolute', left: `${leftPct}%`, width: `${widthPct}%`, top: 0, bottom: 0, background: '#22c55e' }} />
                  );
                })}
                {/* marker */}
                {baseStartMs != null && (
                  <div style={{ position: 'absolute', left: `${((baseStartMs + getGlobalTime() * 1000 - dayStart) / (dayEnd - dayStart)) * 100}%`, top: -4, bottom: -4, width: 2, background: '#9ca3af' }} />
                )}
              </div>
              {/* hour ticks */}
              <div style={{ position: 'absolute', left: 10, right: 10, top: 36, display: 'flex', justifyContent: 'space-between', color: '#9ca3af', fontSize: 11 }}>
                {Array.from({ length: 24 }, (_, i) => (
                  <span key={i}>{String(i).padStart(2, '0')}:00</span>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {segments.length > 0 && (
        <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button style={pillBtn()} onClick={() => setClipPoint('start')}>Set Clip Start</button>
          <button style={pillBtn()} onClick={() => setClipPoint('end')}>Set Clip End</button>
          <button style={pillBtn()} disabled={clipRange.start == null || clipRange.end == null} onClick={downloadClipManifest}>Download Manifest</button>
        </div>
      )}
    </div>
  );
}
