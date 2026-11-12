const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'dist');
const port=Number(process.env.PORT)||4173;
http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname;const file=path.join(root,name==='/'?'index.html':name);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return}res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'text/html');res.end(data)})}).listen(port,'0.0.0.0',()=>console.log(`Local: http://localhost:${port}`));
