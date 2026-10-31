import fs from 'node:fs';
const started=Date.now();
const response=await fetch('http://localhost:3000/api/runs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({freeText:'Compara estudios de expresi\u00f3n g\u00e9nica bajo hipoxia',userId:null,depth:'quick'})});
const body=await response.json();console.log(JSON.stringify({phase:'post',ms:Date.now()-started,...body}));
if(!body.streamUrl)process.exit(1);
const stream=await fetch(new URL(body.streamUrl,'http://localhost:3000'),{headers:{cookie:response.headers.get('set-cookie')?.split(';')[0]??''}});
const events=[];let buffer='';
for await(const chunk of stream.body){buffer+=new TextDecoder().decode(chunk);let end;while((end=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,end);buffer=buffer.slice(end+2);for(const line of block.split('\n'))if(line.startsWith('data: ')){const event=JSON.parse(line.slice(6));events.push({ms:Date.now()-started,...event});console.log(JSON.stringify({ms:Date.now()-started,type:event.type,stage:event.stage,detail:event.detail,claims:event.payload?.claims?.length,text:event.text,status:event.status}));}}}
fs.writeFileSync('evals/genetics/hypoxia-live-events.json',JSON.stringify(events,null,2));
