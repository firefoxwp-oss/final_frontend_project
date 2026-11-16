// Prueba de la vista «Mis procesamientos» en Chrome, Firefox y Edge (Sp-10).
//
// Requiere la web y el servidor en marcha y un usuario con procesamientos.
// Variables: WEB_URL, PRUEBA_EMAIL, PRUEBA_CLAVE y, si no estan en la ruta
// por defecto, CHROME_PATH, EDGE_PATH y FIREFOX_PATH.
import {spawn} from 'node:child_process';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import puppeteer from 'puppeteer-core';

const WEB = process.env.WEB_URL ?? 'http://localhost:5173';
const EMAIL = process.env.PRUEBA_EMAIL;
const CLAVE = process.env.PRUEBA_CLAVE;
const ESPERA_MS = 7000;

const NAVEGADORES = [
  {
    nombre: 'Chrome',
    browser: 'chrome',
    ruta:
      process.env.CHROME_PATH ??
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
  },
  {
    nombre: 'Firefox',
    browser: 'firefox',
    ruta:
      process.env.FIREFOX_PATH ??
      'C:/Program Files/Mozilla Firefox/firefox.exe',
  },
  {
    nombre: 'Edge',
    browser: 'chrome',
    // msedge.exe delega en otro proceso y termina, por lo que se arranca
    // aparte y la prueba se conecta a su puerto de depuracion
    conectar: true,
    ruta:
      process.env.EDGE_PATH ??
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  },
];

/** Arranca el navegador aparte y se conecta por su puerto de depuracion. */
async function conectar(ruta) {
  const perfil = mkdtempSync(join(tmpdir(), 'prueba-navegador-'));
  const puerto = 9300 + Math.floor(Math.random() * 500);
  const proceso = spawn(
    ruta,
    [
      '--headless=new',
      `--remote-debugging-port=${puerto}`,
      `--user-data-dir=${perfil}`,
      '--no-first-run',
      'about:blank',
    ],
    {stdio: 'ignore'},
  );
  const browserURL = `http://127.0.0.1:${puerto}`;
  for (let i = 0; i < 40; i++) {
    try {
      const navegador = await puppeteer.connect({browserURL});
      navegador.limpiar = () => {
        proceso.kill();
        try {
          // El navegador libera su perfil unos instantes despues de cerrarse
          rmSync(perfil, {
            recursive: true,
            force: true,
            maxRetries: 10,
            retryDelay: 500,
          });
        } catch {
          // Es un directorio temporal: el sistema lo limpiara si queda algo
        }
      };
      return navegador;
    } catch {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  throw new Error(`No se pudo conectar con ${ruta}`);
}

async function probar({nombre, browser, ruta, conectar: aparte}) {
  const resultado = {navegador: nombre};
  const errores = [];
  const navegador = aparte
    ? await conectar(ruta)
    : await puppeteer.launch({browser, executablePath: ruta, headless: true});
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
    await navegador.close();
    navegador.limpiar?.();
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
