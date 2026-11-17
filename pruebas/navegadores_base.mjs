// Navegadores de las pruebas y forma de abrirlos (Chrome, Firefox y Edge).
//
// Rutas por defecto de Windows; se cambian con CHROME_PATH, EDGE_PATH y
// FIREFOX_PATH.
import {spawn} from 'node:child_process';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import puppeteer from 'puppeteer-core';

export const NAVEGADORES = [
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

/** Abre el navegador indicado; al terminar se cierra con cerrar(). */
export async function abrir({browser, ruta, conectar: aparte}, args = []) {
  return aparte
    ? conectar(ruta)
    : puppeteer.launch({browser, executablePath: ruta, headless: true, args});
}

export async function cerrar(navegador) {
  await navegador.close();
  navegador.limpiar?.();
}
