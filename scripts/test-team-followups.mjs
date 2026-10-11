import assert from 'node:assert/strict';
import {build} from 'esbuild';
const b = await build({stdin:{contents:"export * from './lib/hackmate/team-introduction';export * from './lib/hackmate/intake';export * from './lib/hackmate/conversation-route';export * from './lib/hackmate/demo';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false});
const m=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
let count=0;const test=(name,fn)=>{fn();count++;console.log('PASS '+name);};
const team={...m.freshWorkspace(),event:'CodeRED Orion',intake:{stage:'team',skipped:[]}};
test('Spoken multi-person introduction saves both members without skipping the roster',()=>{
 const r=m.saveIntroduction(team,"I'm Collins, a beginner in Python and Alex is intermediate in C++");
 assert.equal(r.workspace.members.length,2);assert.equal(m.currentIntake(r.workspace).stage,'team');
 assert.equal(r.workspace.members[1].skills,'C++');assert.equal(r.workspace.members[1].level,'Intermediate');
 assert.equal(team.members.length,0);
});
test('Name, skills, then level save across turns without repeating answered fields',()=>{
 let r=m.saveIntroduction(team,'My name is Collins.');assert.match(r.answer,/coding skills/);
 r=m.saveIntroduction(r.workspace,'Python and React');assert.match(r.answer,/experience level/);assert.doesNotMatch(r.answer,/coding skills/);
 r=m.saveIntroduction(r.workspace,'beginner');assert.equal(r.workspace.members[0].level,'Learning');assert.doesNotMatch(r.answer,/experience level|coding skills/);
 r=m.saveIntroduction(r.workspace,'Yeah, team is ready.');assert.equal(m.currentIntake(r.workspace).stage,'experience');
});
test('A complete member does not imply the entire team has been supplied',()=>{
 const r=m.saveIntroduction(team,'My name is Collins. I am a beginner in Python.');
 assert.equal(m.currentIntake(r.workspace).stage,'team');
 const n=m.saveIntroduction(r.workspace,'Add Jordan to our team, intermediate in React.');assert.equal(n.workspace.members.length,2);
});
test('Explicit team additions work after onboarding and preserve the plan',()=>{
 const w={...team,intake:{stage:'done',skipped:['team','experience','goal','documents','hours']},tasks:[{id:'existing',title:'Keep me'}]};
 const r=m.saveIntroduction(w,'Add Jordan to our team, beginner in React.');assert.equal(r.workspace.members.length,1);assert.deepEqual(r.workspace.tasks,w.tasks);
});
test('Repeated names update without duplicate IDs',()=>{
 const first=m.saveIntroduction(team,'Add Alex to our team, intermediate in Python.');
 const second=m.saveIntroduction(first.workspace,'Add Alex to our team, React.');
 assert.equal(second.workspace.members.length,1);assert.equal(second.workspace.members[0].id,first.workspace.members[0].id);assert.match(second.workspace.members[0].skills,/React/);
});
test('Unknown skills answer the missing skills question without inventing a level',()=>{
 let r=m.saveIntroduction(team,'My name is Collins.');r=m.saveIntroduction(r.workspace,'unknown');
 assert.equal(r.workspace.members[0].skills,'Unknown');assert.equal(r.workspace.members[0].level,'');assert.match(r.answer,/experience level/);
});
test('Non-team additions and former teammates never create members',()=>{
 assert.equal(m.saveIntroduction({...team,intake:{stage:'done',skipped:['team','experience','goal','documents','hours']}},'Add a task to our list'),null);
 assert.equal(m.saveIntroduction(team,'Alex left our team.'),null);
});
const ready={...m.initialWorkspace(),intake:{stage:'done',skipped:[]}};
ready.ideas=m.demoResponse({action:'ideas',provider:'demo',workspace:ready}).ideas;
test('Common more-information requests preserve existing idea routing',()=>{
 for(const q of ['Give me more information on the ideas','Tell me more about idea 2','Expand the first idea','Go deeper on these ideas']) assert.equal(m.conversationAction(q,ready),'chat');
 assert.equal(m.conversationAction('Give me more ideas',ready),'ideas');
 assert.equal(m.isIdeaFollowup('Explain the code',ready),false);
 assert.equal(m.isIdeaFollowup('Explain the uploaded documents',ready),false);
});
test('Idea detail followups resolve numbers and all ideas without mutations',()=>{
 const response=m.demoResponse({action:'chat',provider:'demo',workspace:ready,question:'Tell me more about idea 2'});
 assert.match(response.answer,/Campus Compass/);assert.match(response.answer,/Smallest prototype/);assert.deepEqual(response.operations,[]);assert.equal(ready.selectedIdea,null);
 const all=m.demoResponse({action:'chat',provider:'demo',workspace:ready,question:'Give me more information on all the ideas'});
 for(const i of ready.ideas)assert.ok(all.answer.includes(i.title));
});
console.log(count+' team and idea follow-up regressions passed.');
