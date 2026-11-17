// Prueba del Modo Karaoke en Chrome, Firefox y Edge (Pb-5 y Pb-6, Sp-16).
//
// Abre una cancion karaoke terminada, la reproduce y comprueba que la letra
// se resalta con el audio, que la voz guia cambia sin cortar la cancion y
// que funciona la pantalla completa.
//
// Requiere la web y el servidor en marcha. Variables: WEB_URL, PRUEBA_EMAIL,
// PRUEBA_CLAVE, JOB_ID y, si no estan en la ruta por defecto, CHROME_PATH,
// EDGE_PATH y FIREFOX_PATH.
import {NAVEGADORES, abrir, cerrar} from './navegadores_base.mjs';

const WEB = process.env.WEB_URL ?? 'http://localhost:5173';
const JOB_ID = process.env.JOB_ID;
const BARRA = 'input[aria-label="Posición de la canción"]';
const VOZ = 'input[aria-label="Volumen de la voz guía"]';

const esperar = ms => new Promise(r => setTimeout(r, ms));

/** Mueve un control deslizante como lo haria el usuario. */
const mover = (pagina, selector, valor) =>
  pagina.$eval(
    selector,
    (el, v) => {
      const asignar = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      ).set;
      asignar.call(el, v);
      el.dispatchEvent(new Event('input', {bubbles: true}));
    },
    valor,
  );

const estado = pagina =>
  pagina.evaluate(
    (barra, voz) => ({
      posicion: Number(document.querySelector(barra).value),
      voz: Number(document.querySelector(voz).value),
      cantadas: document.querySelectorAll('[data-cantada="true"]').length,
      suena: Boolean(document.querySelector('button[aria-label="Pausar"]')),
    }),
    BARRA,
    VOZ,
  );

async function probar(nav) {
  const resultado = {navegador: nav.nombre};
  const errores = [];
  const navegador = await abrir(nav, [
    '--autoplay-policy=no-user-gesture-required',
  ]);
  try {
    const pagina = await navegador.newPage();
    await pagina.setViewport({width: 1366, height: 900});
    pagina.on('pageerror', e => errores.push(e.message));
    pagina.on('console', m => m.type() === 'error' && errores.push(m.text()));

    await pagina.goto(`${WEB}/login`, {waitUntil: 'networkidle0'});
    await pagina.type('input[name=email]', process.env.PRUEBA_EMAIL);
    await pagina.type('input[name=password]', process.env.PRUEBA_CLAVE);
    await pagina.click('button[type=submit]');
    await pagina.waitForFunction(() => location.pathname === '/');

    const inicio = Date.now();
    await pagina.goto(`${WEB}/karaoke/${JOB_ID}`);
    await pagina.waitForSelector(
      'button[aria-label="Reproducir"]:not([disabled])',
      {timeout: 120000},
    );
    resultado.cargaSeg = Number(((Date.now() - inicio) / 1000).toFixed(1));

    await pagina.click('button[aria-label="Reproducir"]');
    await mover(pagina, BARRA, 60);
    // La letra se observa unos segundos: un instante puede caer en una pausa
    // entre dos lineas, cuando todavia no hay palabras cantadas
    let antes = await estado(pagina);
    let resaltadas = 0;
    for (let i = 0; i < 8; i++) {
      await esperar(500);
      antes = await estado(pagina);
      resaltadas = Math.max(resaltadas, antes.cantadas);
    }
    resultado.letraResaltada = resaltadas > 0;

    await mover(pagina, VOZ, 0);
    await esperar(800);
    await mover(pagina, VOZ, 100);
    await esperar(800);
    const despues = await estado(pagina);
    resultado.vozGuia = despues.voz === 100;
    resultado.sinCortes =
      despues.suena && despues.posicion - antes.posicion > 1.2;

    const [boton] = await pagina.$$(
      'xpath/.//button[text()="Pantalla completa"]',
    );
    await boton.click();
    resultado.pantallaCompleta = await pagina
      .waitForFunction(() => document.fullscreenElement !== null, {
        timeout: 5000,
      })
      .then(() => true)
      .catch(() => false);
    resultado.errores = errores.length;
  } finally {
    await cerrar(navegador);
  }
  return resultado;
}

const resultados = [];
for (const nav of NAVEGADORES) {
  // Si un navegador falla, se informa y se sigue con los demas
  resultados.push(
    await probar(nav).catch(e => ({
      navegador: nav.nombre,
      error: e.message.slice(0, 80),
    })),
  );
}
console.table(resultados);

const fallo = resultados.some(
  r =>
    !r.letraResaltada ||
    !r.vozGuia ||
    !r.sinCortes ||
    !r.pantallaCompleta ||
    r.errores > 0,
);
process.exitCode = fallo ? 1 : 0;
