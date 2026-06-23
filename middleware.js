export const config = {
  matcher: '/((?!login\\.html|api/login|favicon.ico).*)',
};

function parseCookie(header, name) {
  if (!header) return null;
  const match = header.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
}

export default function middleware(request) {
  const sessionToken = process.env.SESSION_TOKEN;
  const cookieHeader = request.headers.get('cookie');
  const sessionCookie = parseCookie(cookieHeader, 'cena_session');

  if (sessionToken && sessionCookie === sessionToken) {
    return;
  }

  const url = new URL(request.url);

  if (url.pathname.startsWith('/api/')) {
    return new Response(JSON.stringify({ ok: false, error: 'Não autenticado.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const loginUrl = new URL('/login.html', request.url);
  loginUrl.searchParams.set('redirect', url.pathname + url.search);
  return Response.redirect(loginUrl, 307);
}
