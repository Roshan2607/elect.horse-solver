const assert=require('node:assert/strict');
const {solve}=require('../solver.js');
const rows=['RBBR','RWRRR','BRBWRB','B.WBBWB','BRBWRB','RWRRR','RBBR'];
const board={tiles:[],dx:100,width:800,height:900};
for(let r=0;r<rows.length;r++){
  const row=rows[r];
  const left=(7-row.length)*50;
  for(let c=0;c<row.length;c++){
    const sym=row[c];
    board.tiles.push({row:r,col:c,kind:({B:1,R:2,W:-1,'.':0})[sym],x:left+c*100,y:r*86.6025,neighbors:[]});
  }
}
for(let i=0;i<board.tiles.length;i++)for(let j=i+1;j<board.tiles.length;j++){
  const a=board.tiles[i],b=board.tiles[j];
  if(Math.abs(Math.hypot(a.x-b.x,a.y-b.y)-100)<.03){a.neighbors.push(j);b.neighbors.push(i);}
}
function check(k,wins){
  const result=solve(board,k,{maxStates:1250000,maxMillis:8000});
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(result.horseWins,wins);
  assert.equal(result.stats.length,k);
  const expectedVoters=30/k;
  for(let d=0;d<k;d++){
    const ids=board.tiles.map((t,i)=>i).filter(i=>result.assignment[i]===d);
    assert.equal(ids.filter(i=>board.tiles[i].kind>0).length,expectedVoters);
    const seen=new Set([ids[0]]),stack=[ids[0]];
    while(stack.length){
      const i=stack.pop();
      for(const j of board.tiles[i].neighbors)if(result.assignment[j]===d&&!seen.has(j)) {seen.add(j);stack.push(j);}
    }
    assert.equal(seen.size,ids.length,'district disconnected');
  }
  assert.equal(result.assignment.filter(v=>v<0).length,6,'only the 6 ponds should be unassigned');
  console.log(`PASS: ${k} districts, ${wins} horse seats, ${result.expanded} states.`);
}
check(3,2);
check(6,4);
