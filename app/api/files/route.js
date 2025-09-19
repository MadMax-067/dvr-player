export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const cam = searchParams.get('cam') || 'cam3';
  const date = searchParams.get('date');
  const upstream = new URL('https://dev8.pixelsoftwares.com/camera/_test/playback/files.php');
  upstream.searchParams.set('cam', cam);
  if (date) upstream.searchParams.set('date', date);

  try {
    const res = await fetch(upstream.toString(), { cache: 'no-store' });
    if (!res.ok) {
      return new Response(JSON.stringify({ error: `Upstream error ${res.status}` }), { status: 502, headers: { 'content-type': 'application/json' } });
    }
    const data = await res.text();
    
    return new Response(data, {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Network error', detail: String(e) }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
}
