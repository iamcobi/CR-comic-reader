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
test('Real speech answers with number words finish intake',()=>{
 for (const text of ['Four.', 'about four', 'About four hours', "I can work for about four hours is what I'm saying", 'twenty-four hours', 'four and a half hours', 'half an hour']) {
  const r=m.answerIntake(w,text);assert.equal(r.accepted,true);assert.equal(r.workspace.intake.stage,'done');
 }
 assert.equal(m.buildHours('About four hours'),4);assert.equal(m.buildHours('twenty-four hours'),24);assert.equal(m.buildHours('four and a half hours'),4.5);
});
test('Unanswered clock times remain unconfirmed',()=>{
 assert.equal(m.buildHours("So I'll be sleeping from now till like eight AM"),null);
 assert.equal(m.buildHours('till 1 PM tomorrow'),null);
});
test('Already supplied speech is recovered after a reload without another question',()=>{
 const pending={...w,messages:[{role:'user',text:'I can work for about four hours is what I am saying'},{role:'assistant',text:'Please tell me the hours'}]};
 const recovered=m.recoverPendingHours(pending);assert.equal(recovered.hours,4);assert.equal(recovered.intake.stage,'done');
 assert.equal(m.recoverPendingHours({...pending,intake:{stage:'goal',skipped:[]}}).intake.stage,'goal');
});
console.log(passed+' conversation regression checks passed.');
