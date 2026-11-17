// Prueba de la vista «Mis procesamientos» en Chrome, Firefox y Edge (Sp-10).
//
// Requiere la web y el servidor en marcha y un usuario con procesamientos.
// Variables: WEB_URL, PRUEBA_EMAIL, PRUEBA_CLAVE y, si no estan en la ruta
// por defecto, CHROME_PATH, EDGE_PATH y FIREFOX_PATH.
import {NAVEGADORES, abrir, cerrar} from './navegadores_base.mjs';

const WEB = process.env.WEB_URL ?? 'http://localhost:5173';
const EMAIL = process.env.PRUEBA_EMAIL;
const CLAVE = process.env.PRUEBA_CLAVE;
const ESPERA_MS = 7000;

async function probar({nombre, browser, ruta, conectar: aparte}) {
  const resultado = {navegador: nombre};
  const errores = [];
  const navegador = await abrir({browser, ruta, conectar: aparte});
  try {
    const pagina = await navegador.newPage();
    await pagina.setViewport({width: 1366, height: 900});
    pagina.on('pageerror', e => errores.push(e.message));
    pagina.on('console', m => m.type() === 'error' && errores.push(m.text()));

    await pagina.goto(`${WEB}/login`, {waitUntil: 'networkidle0'});
    await pagina.type('input[name=email]', EMAIL);
    await pagina.type('input[name=password]', CLAVE);
    await pagina.click('button[type=submit]');
    await pagina.waitForFunction(() => location.pathname === '/');

    let consultas = 0;
    pagina.on('request', r => {
      if (new URL(r.url()).pathname === '/jobs') consultas++;
    });
    await pagina.goto(`${WEB}/procesamientos`, {waitUntil: 'networkidle0'});
    const inicial = consultas;
    await new Promise(r => setTimeout(r, ESPERA_MS));
    const texto = await pagina.evaluate(() => document.body.innerText);

    resultado.vista = texto.includes('Mis procesamientos');
    resultado.estados = /En cola|Procesando|Terminado|Error/.test(texto);
    resultado.avisoActualizacion = texto.includes(
      'Se actualiza automáticamente',
    );
    resultado.actualizaSola = consultas - inicial >= 2;
    resultado.errores = errores.length;
  } finally {
    await cerrar(navegador);
  }
  return resultado;
}

const resultados = [];
for (const nav of NAVEGADORES) {
  resultados.push(await probar(nav));
}
console.table(resultados);

const fallo = resultados.some(
  r =>
    !r.vista ||
    !r.estados ||
    !r.avisoActualizacion ||
    !r.actualizaSola ||
    r.errores > 0,
);
process.exitCode = fallo ? 1 : 0;
