import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
const output = '.design-preview';
await mkdir(output, {recursive:true});
await build({
 stdin: {contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {CoachingWorkspace} from './src/app/(admin)/reporting/coaching/workspace'; createRoot(document.getElementById('root')).render(<CoachingWorkspace/>);`, resolveDir:process.cwd(),loader:'tsx'},
 bundle:true,outfile:`${output}/preview.js`,jsx:'automatic',format:'esm',
 plugins:[{name:'preview-links',setup(build){build.onResolve({filter:/^next\/link$/},()=>({path:'next/link',namespace:'preview'}));build.onLoad({filter:/.*/,namespace:'preview'},()=>({contents:`import React from 'react';export default function Link({children,...props}){return <a {...props} href={props.href.startsWith("/")?"https://app.tempoapp.ai"+props.href:props.href}>{children}</a>}`,loader:'jsx',resolveDir:process.cwd()}));}}],
});
await writeFile(`${output}/index.html`, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tempo | Coaching design preview</title><link rel="stylesheet" href="preview.css"><style>
:root{--background:#f7f7fa;--foreground:#191533;--card:#fff;--primary:#4b45ff;--primary-foreground:#fff;--secondary:#f2f1fb;--muted-foreground:#6d6a8b;--border:#e8e5f3}*{box-sizing:border-box}body{margin:0;padding:30px;background:var(--background);font-family:Inter,Arial,sans-serif;color:var(--foreground)}h1,h2,h3,p{margin:0}button,input,textarea,select{font:inherit;color:inherit}button{border:0;background:none;cursor:pointer}a{text-decoration:none;color:inherit}input{border:0}h1{font-size:28px;letter-spacing:-1px}#root>div>div:has(>div>h1){display:flex;justify-content:space-between;align-items:end;gap:15px}#root h1+div{font-size:13px;color:var(--muted-foreground);margin-top:7px}#root div:has(>h1)>p{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--primary);margin-bottom:7px}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}@media(max-width:640px){body{padding:16px}#root>div>div:has(>div>h1){display:block}h1{font-size:25px}#root>div>div:has(>div>h1)>div+div{margin-top:14px}}
</style></head><body><div id="root"></div><script type="module" src="preview.js"></script></body></html>`);
console.log('Coaching preview built in .design-preview');
