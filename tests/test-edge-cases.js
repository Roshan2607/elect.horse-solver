const assert = require('node:assert/strict');
const {solve}=require('../solver.js');
function mk(kinds,edges){return {tiles:kinds.map((kind,i)=>({kind,x:i*10,y:0,neighbors:edges.filter(e=>e.includes(i)).map(e=>e[0]===i?e[1]:e[0])}))};}
const chain=n=>Array.from({length:n-1},(_,i)=>[i,i+1]);
function valid(board,k,options){const res=solve(board,k,{maxStates:200000,maxMillis:3000,...options});assert.equal(res.ok,true,JSON.stringify(res)); const quota=board.tiles.filter(t=>t.kind>0).length/k;assert.equal(res.stats.length,k);for(let d=0;d<k;d++){const members=board.tiles.flatMap((t,i)=>res.assignment[i]===d?[i]:[]);assert.equal(members.filter(i=>board.tiles[i].kind>0).length,quota);const seen=new Set([members[0]]),stack=[members[0]];while(stack.length){let i=stack.pop();for(let j of board.tiles[i].neighbors)if(res.assignment[j]===d&&!seen.has(j)){seen.add(j);stack.push(j);}}assert.equal(seen.size,members.length);}return res;}
valid(mk([1,2,3,4,1,2,3,4],chain(8)),4);console.log('PASS four parties');
valid(mk([1,0,2,3,4,0,1,2],chain(8)),3,{targetWins:2});console.log('PASS empty connectors');
assert.throws(()=>solve(mk([1,2,3],chain(3)),2),/cannot be divided/);
assert.throws(()=>solve(mk([1,2,3,4],[ [0,1],[1,2] ]),2),/disconnected/);
assert.throws(()=>solve(mk([1,5,2,3],chain(4)),2),/Invalid tile/);
const invalidAdj=mk([1,2,3,4],chain(4)); invalidAdj.tiles[1].neighbors=[]; assert.throws(()=>solve(invalidAdj,2),/symmetric/);
assert.throws(()=>solve(mk([1,2,3,4],chain(4)),0),/District count/);
console.log('PASS invalid population, disconnected islands, parties, adjacency, district count');
