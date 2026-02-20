const fs = require('fs');
const path = require('path');
const { minify } = require('terser');
const CleanCSS = require('clean-css');

const ROOT = path.join(__dirname, '..');

async function minifyJS(inputPath, outputPath) {
  const fullInput = path.join(ROOT, inputPath);
  const fullOutput = path.join(ROOT, outputPath);

  if (!fs.existsSync(fullInput)) {
    console.log(`  SKIP: ${inputPath} (not found)`);
    return;
  }

  const code = fs.readFileSync(fullInput, 'utf8');
  const result = await minify(code);

  if (result.code) {
    fs.writeFileSync(fullOutput, result.code);
    const origSize = (code.length / 1024).toFixed(1);
    const minSize = (result.code.length / 1024).toFixed(1);
    const savings = (((code.length - result.code.length) / code.length) * 100).toFixed(1);
    console.log(`  JS: ${inputPath} (${origSize}KB -> ${minSize}KB, -${savings}%)`);
  }
}

function minifyCSS(inputPath, outputPath) {
  const fullInput = path.join(ROOT, inputPath);
  const fullOutput = path.join(ROOT, outputPath);

  if (!fs.existsSync(fullInput)) {
    console.log(`  SKIP: ${inputPath} (not found)`);
    return;
  }

  const code = fs.readFileSync(fullInput, 'utf8');
  const result = new CleanCSS().minify(code);

  if (result.styles) {
    fs.writeFileSync(fullOutput, result.styles);
    const origSize = (code.length / 1024).toFixed(1);
    const minSize = (result.styles.length / 1024).toFixed(1);
    const savings = (((code.length - result.styles.length) / code.length) * 100).toFixed(1);
    console.log(`  CSS: ${inputPath} (${origSize}KB -> ${minSize}KB, -${savings}%)`);
  }
}

async function main() {
  console.log('Building minified assets...\n');

  // Minify JS files
  await minifyJS('public/js/index_modules.js', 'public/js/index_modules.min.js');
  await minifyJS('public/js/admin_modules.js', 'public/js/admin_modules.min.js');
  await minifyJS('public/js/jugador_v2.js', 'public/js/jugador_v2.min.js');
  await minifyJS('public/js/equipo_v2.js', 'public/js/equipo_v2.min.js');

  // Minify CSS files
  minifyCSS('public/equipo.css', 'public/equipo.min.css');
  minifyCSS('public/css/optimizations.css', 'public/css/optimizations.min.css');
  minifyCSS('public/css/jugador_v2.css', 'public/css/jugador_v2.min.css');
  minifyCSS('public/css/equipo_v2.css', 'public/css/equipo_v2.min.css');

  console.log('\nBuild complete!');
}

main().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
