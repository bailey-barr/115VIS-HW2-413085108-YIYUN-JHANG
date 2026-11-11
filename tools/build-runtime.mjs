// Build browser runtime with libraries and app in a guaranteed order.
import fs from 'node:fs';
const base=new URL('../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,base),'utf8');
fs.writeFileSync(new URL('runtime.js',base),'/* D3 7.9.0 + TopoJSON 3.1.0; licenses in vendor/. */\n(function(exports,module,define){\n'+read('vendor/d3.min.js')+'\n;'+read('vendor/topojson-client.min.js')+'\n}).call(globalThis,undefined,undefined,undefined);\n'+read('app.js'));
