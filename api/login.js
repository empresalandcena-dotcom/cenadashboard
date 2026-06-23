module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Método não permitido.' });
    return;
  }

  let body = req.body;
  if (!body || typeof body !== 'object') {
    try {
      body = JSON.parse(req.body || '{}');
    } catch (error) {
      body = {};
    }
  }

  const expectedUser = process.env.SITE_USER || 'cena';
  const expectedPass = process.env.SITE_PASSWORD;
  const sessionToken = process.env.SESSION_TOKEN;

  if (!expectedPass || !sessionToken) {
    res.status(500).json({ ok: false, error: 'Autenticação não configurada.' });
    return;
  }

  if (body.user !== expectedUser || body.pass !== expectedPass) {
    res.status(401).json({ ok: false, error: 'Credenciais inválidas.' });
    return;
  }

  // expira no fim do dia (forca login diario)
  const now = new Date();
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const maxAge = Math.max(0, Math.floor((endOfDay.getTime() - now.getTime()) / 1000));
  res.setHeader('Set-Cookie', `cena_session=${sessionToken}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`);
  res.status(200).json({ ok: true });
};
