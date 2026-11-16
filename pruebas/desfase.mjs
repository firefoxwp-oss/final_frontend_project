// Medicion del desfase entre la letra resaltada y el audio en el Modo
// Karaoke (Pb-5, Sp-12; meta RR-07: 100 ms como maximo).
//
// Reproduce una cancion y registra, en el instante en que cada palabra pasa a
// resaltada, la posicion del audio; el desfase es esa posicion menos el
// inicio de la palabra en la letra. Tambien compara el reloj de audio con el
// reloj real para detectar deriva.
//
// Requiere la web y el servidor en marcha. Variables: WEB_URL, PRUEBA_EMAIL,
// PRUEBA_CLAVE, JOB_ID (cancion karaoke terminada del usuario), DESDE
// (segundo inicial, por defecto 0), SEGUNDOS (por defecto 30) y CHROME_PATH.
import puppeteer from 'puppeteer-core';

const WEB = process.env.WEB_URL ?? 'http://localhost:5173';
const DESDE = Number(process.env.DESDE ?? 0);
const SEGUNDOS = Number(process.env.SEGUNDOS ?? 30);
const META_MS = 100;

const navegador = await puppeteer.launch({
  executablePath:
    process.env.CHROME_PATH ??
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const pagina = await navegador.newPage();
await pagina.goto(`${WEB}/login`, {waitUntil: 'networkidle0'});
await pagina.type('input[name=email]', process.env.PRUEBA_EMAIL);
await pagina.type('input[name=password]', process.env.PRUEBA_CLAVE);
await pagina.click('button[type=submit]');
await pagina.waitForFunction(() => location.pathname === '/');
await pagina.goto(`${WEB}/karaoke/${process.env.JOB_ID}`);
await pagina.waitForSelector(
  'button[aria-label="Reproducir"]:not([disabled])',
  {timeout: 60000},
);

// Registro de cada palabra que pasa a resaltada y de la posicion mostrada
await pagina.evaluate(() => {
  const barra = () =>
    Number(
      document.querySelector('input[aria-label="Posición de la canción"]')
        .value,
    );
  window.palabras = [];
  window.reloj = [];
  // React reutiliza los nodos al cambiar de linea: cada palabra se
  // identifica por su inicio
  const vistas = new Set();
  const revisar = nodo => {
    if (
      nodo.dataset?.cantada === 'true' &&
      !vistas.has(nodo.dataset.inicio) &&
      barra() > 0
    ) {
      vistas.add(nodo.dataset.inicio);
      window.palabras.push({
        inicio: Number(nodo.dataset.inicio),
        posicion: barra(),
      });
    }
  };
  new MutationObserver(cambios => {
    for (const c of cambios) {
      if (c.type === 'attributes') revisar(c.target);
      for (const n of c.addedNodes) {
        if (n.nodeType === 1) {
          revisar(n);
          n.querySelectorAll?.('[data-cantada]').forEach(revisar);
        }
      }
    }
  }).observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['data-cantada'],
  });
  setInterval(
    () => window.reloj.push({real: performance.now(), audio: barra()}),
    500,
  );
});

await pagina.click('button[aria-label="Reproducir"]');
await pagina.$eval(
  'input[aria-label="Posición de la canción"]',
  (el, s) => {
    const asignar = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    ).set;
    asignar.call(el, s);
    el.dispatchEvent(new Event('input', {bubbles: true}));
  },
  DESDE,
);
await new Promise(r => setTimeout(r, SEGUNDOS * 1000));
const {palabras, reloj} = await pagina.evaluate(() => ({
  palabras: window.palabras,
  reloj: window.reloj,
}));
await navegador.close();

// Solo cuentan las palabras que empiezan durante la medicion
const medidas = palabras
  .filter(p => p.inicio > DESDE + 0.5)
  .map(p => (p.posicion - p.inicio) * 1000);
const maximo = Math.max(...medidas.map(Math.abs));
const promedio = medidas.reduce((a, b) => a + Math.abs(b), 0) / medidas.length;
const tramo = reloj.filter(r => r.audio > DESDE);
const deriva =
  ((tramo.at(-1).audio - tramo[0].audio) * 1000 -
    (tramo.at(-1).real - tramo[0].real)) /
  ((tramo.at(-1).real - tramo[0].real) / 1000);

console.log(`Palabras medidas: ${medidas.length}`);
console.log(`Desfase promedio: ${promedio.toFixed(1)} ms`);
console.log(`Desfase maximo: ${maximo.toFixed(1)} ms (meta ${META_MS} ms)`);
console.log(`Deriva del reloj de audio: ${deriva.toFixed(1)} ms por segundo`);
if (medidas.length === 0 || maximo > META_MS) process.exit(1);
