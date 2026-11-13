import fs from 'node:fs';
fs.mkdirSync('dist/server',{recursive:true});
fs.copyFileSync('worker.mjs','dist/server/index.js');
