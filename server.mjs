// No npm installation required. Serves only this project on the local computer.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4173);
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.pdf':'application/pdf','.csv':'text/csv; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.mp4':'video/mp4','.srt':'text/plain; charset=utf-8','.webm':'video/webm','.md':'text/plain; charset=utf-8'};
const server = http.createServer((req,res)=>{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  let requestPath;
  try{requestPath=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);res.end();return;}
  const target=path.resolve(root,`.${requestPath==='/'?'/index.html':requestPath}`);
  if(!target.startsWith(root+path.sep)||path.relative(root,target).split(path.sep).some(p=>p.startsWith('.'))){res.writeHead(403);res.end();return;}
  fs.stat(target,(error,stat)=>{
    if(error||!stat.isFile()){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('找不到檔案');return;}
    const headers={'Content-Type':types[path.extname(target)]||'application/octet-stream','Content-Length':stat.size,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Accept-Ranges':'bytes'};
    let start=0,end=stat.size-1,status=200;
    if(req.headers.range){
      const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if(!match||(!match[1]&&!match[2])){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`});res.end();return;}
      if(!match[1])start=Math.max(0,stat.size-Number(match[2]));
      else{start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));}
      if(start>end||start>=stat.size){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`});res.end();return;}
      status=206;headers['Content-Range']=`bytes ${start}-${end}/${stat.size}`;headers['Content-Length']=end-start+1;
    }
    res.writeHead(status,headers);
    if(req.method==='HEAD'){res.end();return;}
    const stream=fs.createReadStream(target,{start,end});stream.on('error',()=>res.destroy());stream.pipe(res);
  });
});
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`Port ${port} is already in use. Set PORT to another number, e.g. 4174.`:error.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log(`Taiwan Overseas dashboard: http://127.0.0.1:${port}\nPress Ctrl+C to stop.`));
