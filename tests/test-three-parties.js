const assert = require('node:assert/strict');
const {solve}=require('../solver.js');
const tiles=[];
for(let r=0;r<6;r++)for(let c=0;c<8;c++){
  const i=r*8+c;
  tiles.push({x:100*c+50*(r%2),y:100*Math.sqrt(3)/2*r,
    kind:i<13?1:i<33?2:3,neighbors:[]});
}
for(let i=0;i<tiles.length;i++)for(let j=i+1;j<tiles.length;j++){
  if(Math.abs(Math.hypot(tiles[i].x-tiles[j].x,tiles[i].y-tiles[j].y)-100)<.1){
    tiles[i].neighbors.push(j);tiles[j].neighbors.push(i);
  }
}
const r=solve({tiles},8,{maxStates:1000000,maxMillis:8000});
assert.ok(r.ok, r.reason);
assert.equal(r.districts,8);
assert.equal(r.quota,6);
assert.ok(r.horseLeads);
assert.equal(r.assignment.length,48);
assert.ok(r.winCounts[1]>Math.max(r.winCounts[2],r.winCounts[3]));
for(let d=0;d<8;d++){
  const cells=tiles.map((_,i)=>i).filter(i=>r.assignment[i]===d);
  assert.equal(cells.length,6);
  const seen=new Set([cells[0]]),stack=[cells[0]];
  while(stack.length){let i=stack.pop();for(let j of tiles[i].neighbors)if(r.assignment[j]===d&&!seen.has(j)){seen.add(j);stack.push(j);}}
  assert.equal(seen.size,6);
}
console.log('PASS 8 districts, 3 parties, horse plurality');
