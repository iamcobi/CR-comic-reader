# Pip’s 30 gestures

Open “30 ways to be here for you” in the app to try each one. These are CSS gestures on the new black SVG silhouette with growing limbs. One main state plays at a time. Voice moves the mouth independently, preserving the active action gesture. Multiple validated actions play their gesture sequence. Reduced-motion preferences turn off movement while keeping readable status text.

| # | Gesture | Event | Cycle |
|---|---|---|---|
| 1 | At ease | Waiting for you | 5s |
| 2 | Hello wave | Opening the companion | 2.2s |
| 3 | Listening lean | Microphone active | 1.8s |
| 4 | Catching words | Speech becomes text | 1.2s |
| 5 | Thinking orbit | Waiting for an AI response | 2.6s |
| 6 | Looking around | Checking the next task | 1.8s |
| 7 | Reading the brief | Adding or using documents | 2.2s |
| 8 | Got-it nod | A request is understood | 1s |
| 9 | Talking rhythm | Voice playback actually starts | 0.9s |
| 10 | Curious tilt | Asking about your team | 1.6s |
| 11 | Idea spark | Project ideas arrive | 1.7s |
| 12 | Decision nod | Selecting a project | 1.2s |
| 13 | Putting it together | Creating a game plan | 2.4s |
| 14 | Write & place | Adding a to-do | 1.6s |
| 15 | Your turn | Giving someone a task | 1.4s |
| 16 | Check it off | Completing a task | 1.3s |
| 17 | Little victory | Finishing a milestone | 2.2s |
| 18 | Meet the crew | Adding a teammate | 1.8s |
| 19 | Bring it in | A team bonding check-in | 2.3s |
| 20 | You’ve got this | A teammate needs encouragement | 1.8s |
| 21 | Something’s stuck | A task is marked blocked | 1.5s |
| 22 | Room to breathe | A blocked task is reopened | 2s |
| 23 | Time to scope | Discussing time remaining | 1.6s |
| 24 | One thing at a time | Narrowing the project scope | 2.2s |
| 25 | Let me show you | Explaining a coding concept | 2.2s |
| 26 | Keeping context | Loading your saved workspace | 1.6s |
| 27 | Safe & sound | Saving an explicit edit | 1.1s |
| 28 | Take it with you | Exporting the team plan | 1.6s |
| 29 | Try that again | A request fails | 1.3s |
| 30 | See you soon | Ending a voice session | 2.2s |

Names and event durations live in `lib/hackmate/motions.ts`. Movement recipes live in `app/globals.css` under `@keyframes motion-…`. `animate()` in `app/page.tsx` changes the active `data-motion` attribute, then returns to idle after the gesture. Listening, thinking, and speaking wait for their actual lifecycle event to finish. The preview gallery loops its chosen gesture for inspection.


## New Pip drawing and limbs

`components/companion.tsx` recreates the supplied black silhouette as SVG with white eyes and a smile. All 30 named motion states reuse this same drawing. Arms smoothly grow from shoulder anchors in 360 ms and retract when the gesture ends. Planning, adding tasks, resolving blockers, and saving activate an extra pair. Growth and arm movement use separate nested groups so waving does not interrupt growth. Speaking moves the smile; focusing narrows the eyes; errors turn the smile into a concerned expression. Device reduced-motion settings disable movement and transitions while preserving state labels.


Intake uses greeting, asking, welcoming-member, remembering, reading, and deadline gestures. AI work cycles through reading/searching/thinking; task and team operations trigger their specific action motions. The gallery is for previewing all 30, while real use plays gestures for the actions actually performed.
