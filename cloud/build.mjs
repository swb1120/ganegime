import fs from 'node:fs';
// Pure JS modules, deterministically combined without third-party build dependencies.
const modules=['provider.mjs','planner.mjs','validation.mjs','worker.mjs'];
const source=modules.map(name=>fs.readFileSync(name,'utf8').replace(/^import .*?;\s*$/gm,'').replace(/\bexport (?=(class|function)\b)/g,'')).join('\n');
fs.mkdirSync('dist/server',{recursive:true});fs.mkdirSync('dist/.openai',{recursive:true});
fs.writeFileSync('dist/server/index.js',source);
fs.copyFileSync('.openai/hosting.json','dist/.openai/hosting.json');
console.log('Built Worker ESM; no runtime credentials in artifact.');
