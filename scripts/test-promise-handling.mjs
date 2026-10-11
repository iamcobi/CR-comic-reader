import assert from 'node:assert/strict';
import {build} from 'esbuild';
const b=await build({stdin:{contents:"export * from './lib/hackmate/read-pdf';export * from './lib/hackmate/storage';export * from './lib/hackmate/cleanup';export * from './lib/hackmate/diagnostics';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'mock-pdf-and-ocr',setup(build){
 build.onResolve({filter:/^(pdfjs-dist|tesseract.js)$/},args=>({path:args.path,namespace:'test'}));
 build.onLoad({filter:/.*/,namespace:'test'},args=>({loader:'js',contents:args.path==='pdfjs-dist'?'export const GlobalWorkerOptions={workerPort:{}};export const getDocument=()=>globalThis.__pdfLoading;':'export const OEM={LSTM_ONLY:1};export const PSM={AUTO:1,SPARSE_TEXT:2};export const createWorker=()=>{throw new Error("OCR should not be needed")};'}));
}}]});
const m=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
let count=0;const test=async(name,fn)=>{await fn();count++;console.log('PASS '+name);};
const unhandled=[];const record=error=>unhandled.push(error);process.on('unhandledRejection',record);
try {
 await test('Cleanup rejection is handled instead of escaping a fire-and-forget callback',async()=>{
  void m.cleanupResource(()=>Promise.reject(new Error('Cleanup fixture failure')),'fixture');
  await new Promise(resolve=>setImmediate(resolve));assert.equal(unhandled.length,0);
 });
 await test('Synchronous cleanup failure also resolves safely',async()=>{
  await assert.doesNotReject(m.cleanupResource(()=>{throw new Error('Synchronous fixture failure');},'fixture'));
 });
 const content='These are readable hackathon rules with enough embedded text to skip OCR.';
 const file={size:100,arrayBuffer:async()=>new ArrayBuffer(0)};
 await test('PDF cleanup failure does not discard successfully extracted text',async()=>{
  globalThis.__pdfLoading={promise:Promise.resolve({numPages:1,getPage:async()=>({getTextContent:async()=>({items:[{str:content}]}),cleanup(){}})}),destroy:async()=>{throw new Error('Fixture cleanup failure');}};
  assert.ok((await m.readPDF(file)).includes(content));
 });
 await test('Cleanup failure preserves the original PDF read error',async()=>{
  globalThis.__pdfLoading={promise:Promise.reject(new Error('Original PDF read error')),destroy:async()=>{throw new Error('Cleanup error');}};
  await assert.rejects(m.readPDF(file),/Original PDF read error/);
 });
 await test('Workspace snapshot errors return a catchable promise',async()=>{
  let pending;assert.doesNotThrow(()=>{pending=m.saveWorkspace({uncloneable:()=>{}});});
  await assert.rejects(pending,{name:'DataCloneError'});
 });
 await test('Startup error listeners report failure without exposing messages and clean up',async()=>{
  const listeners=new Map();globalThis.window={addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
  let notifications=0;const cleanup=m.installRuntimeLogging(()=>notifications++);
  listeners.get('unhandledrejection')({reason:new Error('Fixture private message')});
  assert.equal(notifications,1);cleanup();assert.equal(listeners.size,0);
  await new Promise(resolve=>setImmediate(resolve));delete globalThis.window;
 });
 await new Promise(resolve=>setImmediate(resolve));assert.equal(unhandled.length,0);
 console.log(count+' promise-handling regressions passed.');
}finally{delete globalThis.__pdfLoading;delete globalThis.window;process.removeListener('unhandledRejection',record);}
