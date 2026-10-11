import assert from 'node:assert/strict';
import { build } from 'esbuild';
const result = await build({stdin:{contents:"export * from './lib/hackmate/conversation-route'; export * from './lib/hackmate/intake'; export * from './lib/hackmate/diagnostics';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false});
const m = await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
let passed=0;
function test(name, fn){fn();passed++;console.log('PASS '+name);}
const w={...m.freshWorkspace(),intake:{stage:'hours',skipped:[]}};
test('Deadline is never mistaken for one hour',()=>{
 const r=m.answerIntake(w,'Okay, the build hours I have from now till 1:00 PM tomorrow');
 assert.equal(r.accepted,false);assert.equal(r.workspace.hours,24);assert.equal(r.workspace.intake.stage,'hours');
});
test('Only explicit durations or a bare numeric answer confirm hours',()=>{
 assert.equal(m.buildHours('I can code for 18 hours'),18);
 assert.equal(m.buildHours('18'),18);assert.equal(m.buildHours('10/11/2026'),null);assert.equal(m.buildHours('0 hours'),null);
 assert.equal(m.answerIntake(w,'I can work 12 hours').workspace.intake.stage,'done');
});
test('Questions about documents interrupt intake without consuming an answer',()=>{
 assert.equal(m.isContextQuestion('Before I tell you that, did you read the document I gave you?'),true);
 assert.equal(m.conversationAction('I like project ideas, but did you read the documents I gave you?',w),'chat');
 assert.equal(m.isContextQuestion("I don't have documents"),false);
});
const existing={...w,ideas:[{title:'Freshness tracker'}]};
test('Explaining or showing saved ideas never generates replacements',()=>{
 for(const text of ['Could you elaborate more on each of these ideas?','Can I see the ideas you made up for me?','Explain more on them.']) assert.equal(m.conversationAction(text,existing),'chat');
});
test('Explicit new ideas still generate recommendations',()=>{
 assert.equal(m.conversationAction('Give me new project ideas',existing),'ideas');
 assert.equal(m.conversationAction('Suggest projects based on sponsors',existing),'ideas');
});
test('Existing wrong clock-based intake is repaired without inventing hours',()=>{
 const old={...w,hours:1,intake:{stage:'done',skipped:[]},messages:[{role:'user',text:'from now till 1:00 PM tomorrow'},{role:'assistant',text:'I have our starting context. Would you like project ideas?'}]};
 assert.equal(m.repairClockHours(old).intake.stage,'hours');
 assert.equal(m.repairClockHours({...old,messages:[...old.messages,{role:'user',text:'12 hours'},{role:'assistant',text:'I have our starting context.'}]}).intake.stage,'done');
 assert.equal(m.repairClockHours({...old,messages:[{role:'user',text:'1 hour'},{role:'assistant',text:'I have our starting context.'}]}).intake.stage,'done');
});
test('Nested request logging cannot double wrap a fetch',()=>{
 globalThis.window={fetch:async()=>new Response('{}')};
 const undo=m.installRequestLogging(), first=window.fetch;
 const secondUndo=m.installRequestLogging();assert.equal(window.fetch,first);secondUndo();assert.equal(window.fetch,first);undo();assert.notEqual(window.fetch,first);delete globalThis.window;
});
console.log(passed+' conversation regression checks passed.');
