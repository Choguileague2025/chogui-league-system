const baseUrl = process.env.BASE_URL || process.argv[2];

if (!baseUrl) {
  console.error('Uso: BASE_URL=https://tu-app.up.railway.app node scripts/smoke_test.js');
  process.exit(1);
}

async function fetchJson(url) {
  const res = await fetch(url);
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (_) {
    body = text;
  }
  return { status: res.status, ok: res.ok, body };
}

async function check(label, url, validate) {
  const result = await fetchJson(url);
  if (!result.ok) {
    throw new Error(`${label} fallo (${result.status})`);
  }
  if (validate) {
    validate(result.body);
  }
  console.log(`OK ${label}`);
}

async function main() {
  const normalized = baseUrl.replace(/\/$/, '');
  console.log(`Smoke test sobre ${normalized}`);

  await check('health', `${normalized}/api/health`, body => {
    if (!body || body.status !== 'ok') throw new Error('health invalido');
  });

  await check('torneos', `${normalized}/api/torneos`, body => {
    if (!Array.isArray(body)) throw new Error('torneos no es array');
  });

  await check('equipos', `${normalized}/api/equipos`, body => {
    if (!Array.isArray(body)) throw new Error('equipos no es array');
  });

  await check('standings', `${normalized}/api/standings`, body => {
    if (!Array.isArray(body)) throw new Error('standings no es array');
  });

  await check('lideres', `${normalized}/api/lideres`, body => {
    if (!body || typeof body !== 'object') throw new Error('lideres invalidos');
  });

  console.log('\nSmoke test completado.');
}

main().catch(err => {
  console.error(`FALLO: ${err.message}`);
  process.exit(1);
});
