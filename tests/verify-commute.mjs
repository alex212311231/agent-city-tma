// Exercise the same renderer and update state machine as a live status, without
// changing the status server or waiting for an entire walk in real time.
export function verifyCommute() {
  const { actors, update, advance } = window.cityAudit;
  const coder = actors.find(actor => actor.profile.id === 'coder');
  if (!coder?.home) return [['coder home is missing']];
  const issues = [];
  const idle = new Map(actors.map(actor => [actor.profile.id, {
    district:actor.home.id, action:'idle', activity:'idle',
  }]));
  const working = new Map(idle);
  working.set(coder.profile.id, { district:'dev', action:'coding', activity:'write_code' });

  update(idle,null,true);
  advance(.36);
  if (coder.place !== coder.home.id || coder.occupied === false || coder.wrapper.visible) {
    issues.push(['idle agent is not inside the assigned home',coder.place,coder.occupied,coder.wrapper.visible]);
  }

  update(working,null,false);
  advance(.36);
  if (coder.to !== 'hq' || coder.goal !== 'dev' || !coder.wrapper.visible) {
    issues.push(['agent did not leave home for HQ',coder.place,coder.to,coder.goal,coder.wrapper.visible]);
  }
  let visitedHq = false;
  for (let i=0; i<70 && coder.place!=='dev'; i++) {
    advance(1);
    if (coder.place === 'hq') visitedHq = true;
  }
  if (!visitedHq || coder.place!=='dev') issues.push(['agent did not reach Dev Lab via HQ',visitedHq,coder.place,coder.to]);

  update(idle,null,false);
  for (let i=0; i<70 && coder.place!==coder.home.id; i++) advance(1);
  advance(.36);
  if (coder.place!==coder.home.id || coder.route || coder.wrapper.visible || coder.occupied===false) {
    issues.push(['agent did not return home',coder.place,coder.goal,coder.wrapper.visible]);
  }
  return issues;
}
