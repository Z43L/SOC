const fs = require('fs');
const path = require('path');

const buildPath = path.resolve(__dirname, '..', '..', 'server', 'integrations', 'build', 'agent', 'agent-windows.js');
const destPath = path.resolve(__dirname, '..', 'dist', 'agent-windows.js');

if (fs.existsSync(buildPath)) {
  fs.copyFileSync(buildPath, destPath);
  console.log('agent-windows.js copiado a dist/');
} else {
  console.error('No se encontró agent-windows.js en el build path esperado:', buildPath);
  process.exit(1);
}