import assert from 'node:assert/strict';
import {build} from 'esbuild';
const b=await build({stdin:{contents:"export * from './lib/hackmate/ai';export * from './lib/hackmate/intake';export * from './lib/hackmate/context-memory';export * from './lib/hackmate/conversation-route';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false});
const m=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
let count=0;const test=async(name,fn)=>{await fn();console.log('PASS '+name);count++;};
const original=globalThis.fetch, key=process.env.NVIDIA_API_KEY;
const input={action:'chat',provider:'nvidia',workspace:m.freshWorkspace(),question:'Explain the next step'};
const answer={answer:'Here is the next step.',sources:[],operations:[]};
const frame='data: '+JSON.stringify({choices:[{delta:{content:JSON.stringify(answer)}}]});
const encoder=new TextEncoder();
try {
 process.env.NVIDIA_API_KEY='test-placeholder';
 await test('Final SSE line without newline is not discarded',async()=>{
  globalThis.fetch=async()=>new Response(frame);const events=[];await m.streamChat(input,e=>events.push(e),new AbortController().signal);assert.deepEqual(events.at(-1).result,answer);
 });
 await test('DONE finishes promptly even if upstream connection stays open',async()=>{
  let canceled=false;globalThis.fetch=async()=>new Response(new ReadableStream({start(c){c.enqueue(encoder.encode(frame+'\n\ndata: [DONE]\n\n'));},cancel(){canceled=true;}}));
  const events=[];await m.streamChat(input,e=>events.push(e),new AbortController().signal);assert.deepEqual(events.at(-1).result,answer);assert.equal(canceled,true);
 });
 await test('Dropped stream retries once and commits only the validated result',async()=>{
  let calls=0;globalThis.fetch=async()=>{calls++;if(calls===1)throw new TypeError('network dropped');return Response.json({choices:[{message:{content:JSON.stringify(answer)}}]});};
  const events=[];await m.streamChat(input,e=>events.push(e),new AbortController().signal);assert.equal(calls,2);assert.equal(events.filter(e=>e.result).length,1);assert.equal(events.some(e=>e.status==='retrying'),true);
 });
 await test('Cancellation never starts a retry',async()=>{
  let calls=0;const controller=new AbortController();globalThis.fetch=async()=>{calls++;controller.abort();throw new DOMException('canceled','AbortError');};
  await assert.rejects(m.streamChat(input,()=>{},controller.signal),/canceled/);assert.equal(calls,1);
 });
 await test('Provider rate limit remains a clear error without repeated requests',async()=>{
  let calls=0;globalThis.fetch=async()=>{calls++;return new Response('',{status:429});};await assert.rejects(m.streamChat(input,()=>{},new AbortController().signal),/rate limit/i);assert.equal(calls,1);
 });
 await test('Facts supplied early are kept and missing questions stay in order',()=>{
  let w=m.rememberContext(m.freshWorkspace(),'This is my first hackathon. I can work for about four hours.').workspace;
  assert.equal(m.currentIntake(w).stage,'event');assert.equal(w.hours,4);
  w.documents=[{id:'brief',name:'Official brief',mime:'text/plain',text:'Rules'}];
  w=m.answerIntake(w,'CodeRED Orion').workspace;assert.equal(m.currentIntake(w).stage,'team');
  w=m.answerIntake(w,'Collins | Python | beginner').workspace;assert.equal(m.currentIntake(w).stage,'goal');
  w=m.answerIntake(w,'I have no idea').workspace;assert.equal(m.currentIntake(w).stage,'done');
 });
 await test('Already uploaded documents do not trigger another upload question',()=>{
  const w={...m.freshWorkspace(),intake:{stage:'documents',skipped:[]},documents:[{id:'brief',name:'Packet',mime:'text/plain',text:'Rules'}]};assert.equal(m.currentIntake(w).stage,'hours');
 });
 await test('Critiquing sponsor fit preserves existing ideas',()=>{
  assert.equal(m.conversationAction("Why don't these ideas include sponsors?",input.workspace),'chat');assert.equal(m.conversationAction('Suggest three new sponsor ideas',input.workspace),'ideas');
 });
 await test('Explicit goal updates are retained even after intake is complete',()=>{
  const w={...m.freshWorkspace(),intake:{stage:'done',skipped:['event','team','goal','documents']}};assert.equal(m.rememberContext(w,'My goal for this hackathon is to win.').workspace.goal,'to win');
 });
 console.log(count+' interruption and memory regressions passed.');
} finally {globalThis.fetch=original;if(key===undefined)delete process.env.NVIDIA_API_KEY;else process.env.NVIDIA_API_KEY=key;}
