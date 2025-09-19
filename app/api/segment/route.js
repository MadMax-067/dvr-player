export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const BASE = 'https://dev8.pixelsoftwares.com/camera/_test/playback/';

function buildUpstreamUrl(path) {
  if (!path || typeof path !== 'string') return null;
  if (path.includes('://') || path.includes('..')) return null;
  const clean = path.replace(/^\/+/, '');
  return new URL(clean, BASE).toString();
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get('path');
  const upstreamUrl = buildUpstreamUrl(path);
  if (!upstreamUrl) {
    return new Response(JSON.stringify({ error: 'Invalid path' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  const range = request.headers.get('range') || undefined;
  const headers = new Headers();
  if (range) headers.set('range', range);

  try {
    const res = await fetch(upstreamUrl, {
      method: 'GET',
      headers,
      cache: 'no-store',
      redirect: 'follow',
    });

    const pass = new Headers();
    const copyHeaders = [
      'content-type',
      'content-length',
      'accept-ranges',
      'content-range',
      'etag',
      'last-modified',
      'cache-control',
    ];
    for (const h of copyHeaders) {
      const v = res.headers.get(h);
      if (v) pass.set(h, v);
    }

    if (!pass.has('cache-control')) pass.set('cache-control', 'no-store');
    const isMp4 = path && path.toLowerCase().endsWith('.mp4');
    if (isMp4 && !pass.has('content-type')) pass.set('content-type', 'video/mp4');
    if (!pass.has('accept-ranges')) pass.set('accept-ranges', 'bytes');

    if (process.env.NODE_ENV !== 'production') {
      console.log('[segment proxy]', {
        url: upstreamUrl,
        status: res.status,
        range: range || null,
        contentType: pass.get('content-type'),
        contentRange: pass.get('content-range') || null,
      });
    }

    return new Response(res.body, {
      status: res.status,
      headers: pass,
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Upstream fetch failed', detail: String(e) }), { status: 502, headers: { 'content-type': 'application/json' } });
  }
}

export async function HEAD(request) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get('path');
  const upstreamUrl = buildUpstreamUrl(path);
  if (!upstreamUrl) {
    return new Response(null, { status: 400 });
  }
  const range = request.headers.get('range') || undefined;
  const headers = new Headers();
  if (range) headers.set('range', range);
  try {
    const res = await fetch(upstreamUrl, { method: 'HEAD', headers, cache: 'no-store', redirect: 'follow' });
    const pass = new Headers();
    for (const h of ['content-type','content-length','accept-ranges','content-range','etag','last-modified','cache-control']) {
      const v = res.headers.get(h);
      if (v) pass.set(h, v);
    }
    if (!pass.has('cache-control')) pass.set('cache-control', 'no-store');
    return new Response(null, { status: res.status, headers: pass });
  } catch (e) {
    return new Response(null, { status: 502 });
  }
}
