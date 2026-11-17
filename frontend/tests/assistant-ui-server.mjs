// Serves the existing real-component harness against the isolated SQLite backend.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
const root=fileURLToPath(new URL('../',import.meta.url));
const envDir=await mkdtemp(path.join(tmpdir(),'greentrip-ui-env-'));
const server=await createServer({
  configFile:false,root,envDir,
  define:{'import.meta.env.VITE_API_URL':JSON.stringify(process.env.QA_API_TARGET || 'http://127.0.0.1:8017')},
  plugins:[react(),{name:'assistant-ui-demo',configureServer(vite){
    vite.middlewares.use('/__assistant-ui',async (_req,res)=>{
      res.setHeader('Content-Type','text/html; charset=utf-8');
      res.end(await vite.transformIndexHtml('/__assistant-ui','<meta name="viewport" content="width=device-width, initial-scale=1"><title>GreenTrip SQLite UI demo</title><div id="root"></div><script type="module" src="/tests/travel-assistant-harness.tsx"></script>'));
    });
  }}],
  resolve:{alias:{'@':path.join(root,'src')}},
  optimizeDeps:{exclude:['lucide-react']},
  server:{host:'127.0.0.1',port:Number(process.env.QA_FRONTEND_PORT || 5177),strictPort:true},
});
await server.listen();
console.log(`QA_FRONTEND_URL=http://127.0.0.1:${process.env.QA_FRONTEND_PORT || 5177}/__assistant-ui`);
console.log(`QA_API_TARGET=${process.env.QA_API_TARGET || 'http://127.0.0.1:8017'} (isolated SQLite only)`);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>void server.close().then(()=>process.exit(0)));
