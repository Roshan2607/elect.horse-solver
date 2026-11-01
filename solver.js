/*
 * Offline graph-partition search. Tiles are small hex-graph vertices with
 * value 0=empty, 1=horse, 2+=opponent parties, -1=water (not part of graph).
 * No game state or backend access is used.
 */
(function (scope) {
  'use strict';
  const BITS = (n) => 1n << BigInt(n);
  const MAX_STATES_DEFAULT = 1250000;
  const log = (...args) => { /* set locally for profiling */ };

  function solve(board, districtCount, options={}) {
    const {tiles} = board;
    const active = tiles.filter(t => t.kind !== -1).map((t, i) => ({...t, old: tiles.indexOf(t)}));
    const count = active.length;
    const k = Number(districtCount);
    if (!Number.isInteger(k) || k<2 || k>12) throw Error('District count must be between 2 and 12.');
    if (count>110) throw Error('Board exceeds the 110-cell safety limit for exhaustive search.');
    const voters = active.filter(t=>t.kind>0).length;
    if (voters===0 || voters%k) throw Error(`${voters} voters cannot be divided equally into ${k} districts.`);
    const quota = voters/k;
    if (quota<2) throw Error('Each district must have at least two voters.');
    if (tiles.some(t=>!Number.isInteger(t.kind)||t.kind < -1||t.kind>4 || !Array.isArray(t.neighbors))) throw Error('Invalid tile classification or adjacency.');
    const indexByOld = new Map(active.map((t,i)=>[t.old,i]));
    const adj = active.map(t => t.neighbors.map(j=>indexByOld.get(j)).filter(j=>j!==undefined));
    for(let i=0;i<adj.length;i++) for(const j of adj[i]) if(j===i || !adj[j].includes(i)) throw Error('Board adjacency must be symmetric and exclude self-loops.');
    const bits=active.map((_,i)=>BITS(i));
    const adjMask=adj.map(a=>a.reduce((m,j)=>m|bits[j],0n));
    const all=bits.reduce((m,b)=>m|b,0n);
    const partyCount = Math.max(2,...active.map(t=>t.kind));
    const kind=active.map(t=>t.kind);
    const value=kind.map(c=>c>0?1:0);
    const limit=options.maxStates ?? MAX_STATES_DEFAULT;
    const target=options.targetWins ?? (partyCount>2?Math.ceil(k/3):Math.floor(k/2)+1);
    let expanded=0, best=null, bestScore=-Infinity, stopped=false;
    let targetHit=false;
    const started=Date.now();
    const maxMillis=options.maxMillis ?? 7500;
    const maxCand=options.maxCandidatesPerDistrict ?? 18000;

    function scoreDistrict(mask) {
      const cc=Array(partyCount+1).fill(0);
      let n=0, x=mask;
      while(x){
        const b=x&-x;
        // sparse board size max 63: index lookup in dictionary
        const id=bitId.get(b);
        if(kind[id]>0){cc[kind[id]]++; n++;}
        x^=b;
      }
      let top=0, winner=0, tie=false;
      for(let p=1;p<cc.length;p++) {
        if(cc[p]>top){top=cc[p];winner=p;tie=false;}
        else if(cc[p]===top){tie=true;}
      }
      return {counts:cc,winner:tie?0:winner,horse:(!tie&&winner===1)?1:0, n};
    }
    const bitId = new Map(bits.map((b,i)=>[b,i]));
    function minBitIndex(mask){
      const low=mask&-mask;return bitId.get(low);
    }
    function componentsValid(rem, regionsLeft){
      if(!rem) return regionsLeft===0;
      let left=rem, comps=0, voteTotal=0;
      while(left){
        comps++;
        let seen=left&-left;
        let frontier=seen;
        let partyVoters=0;
        while(frontier) {
          const low=frontier&-frontier, i=bitId.get(low);
          partyVoters+=value[i];
          frontier^=low;
          const news=adjMask[i]&left&~seen;
          if(news){seen|=news;frontier|=news;}
        }
        if(partyVoters===0) return false;
        if(partyVoters % quota !== 0 || partyVoters < quota) return false;
        voteTotal+=partyVoters;
        left &= ~seen;
      }
      return comps<=regionsLeft && voteTotal===regionsLeft*quota;
    }
    function mustStop() {return expanded >= limit || Date.now()-started > maxMillis;}
    function orderedChoices(frontier, mask, strategy) {
      const arr=[];
      let b=frontier;
      while(b){const bit=b&-b;const id=bitId.get(bit); b^=bit;arr.push(id);}
      // Prefer building horse-majority districts, or packing opposition.
      arr.sort((a,b)=>{
        const v=(i)=>{
          const distPenalty=(active[i].x-active[minBitIndex(mask)].x)**2+(active[i].y-active[minBitIndex(mask)].y)**2;
          let prefer=kind[i]===0?-0.4:kind[i]===strategy?3:0;
          return prefer-distPenalty*.000025;
        };
        return v(b)-v(a);
      });
      return arr;
    }
    function recurse(rem, regions, wins, partitions) {
      if(targetHit || mustStop()){stopped=mustStop(); return;}
      const left=k-regions;
      if(left===1) {
        if(!componentsValid(rem,1)) return;
        const score=scoreDistrict(rem);
        const total=wins+score.horse;
        const allParts=partitions.concat([rem]);
        const winCounts=Array(partyCount+1).fill(0);
        for(const mask of allParts){const sc=scoreDistrict(mask);if(sc.winner)winCounts[sc.winner]++;}
        const largestOther=Math.max(...winCounts.slice(2));
        const horseLeads=total>largestOther;
        // First prefer a genuine horse victory; next maximize horse seats
        // and margin versus the strongest opponent.
        const key=(horseLeads?100000:0)+total*1000-largestOther*350 +
          allParts.reduce((a,mask)=>{const s=scoreDistrict(mask);return a+(s.horse ? s.counts[1]*2-Math.max(...s.counts.slice(2)) : 0);},0);
        if(key>bestScore){ bestScore=key;best={parts:allParts.slice(),horseWins:total,winCounts,horseLeads}; }
        if(horseLeads && total>=target)targetHit=true;
        return;
      }
      if(!componentsValid(rem,left))return;
      const anchor=minBitIndex(rem);
      const anchorBit=bits[anchor];
      let visited=new Set(), candidates=0;
      const strategy = regions===0?2:1; // first pack cow, then spread horse
      function extend(mask,frontier,pop) {
        if(targetHit || mustStop() || candidates>=maxCand) {stopped=stopped||mustStop()||candidates>=maxCand;return;}
        expanded++;
        if(pop===quota){
          candidates++;
          const next=rem&~mask;
          if(!componentsValid(next,left-1))return;
          const thisScore=scoreDistrict(mask);
          // A higher Horse seat total is not sufficient to prove a better election result.
          // Preserve branches that might yield a strict lead over every rival.
          recurse(next,regions+1,wins+thisScore.horse,partitions.concat([mask]));
          // A solved district may need to include one or more adjacent empty
          // tiles to prevent a disconnected empty-only island in the remainder.
          // Continue expansion, but only by adding empty cells.
        }
        const options=orderedChoices(frontier,mask,strategy);
        for(const id of options){
          if(targetHit || mustStop())break;
          const bit=bits[id];
          const newPop=pop+value[id];
          if(newPop>quota || (pop===quota && value[id]>0))continue;
          const newMask=mask|bit;
          if(visited.has(newMask))continue;
          visited.add(newMask);
          const newFrontier=(frontier|adjMask[id])&rem&~newMask;
          extend(newMask,newFrontier,newPop);
        }
      }
      visited.add(anchorBit);
      extend(anchorBit,adjMask[anchor]&rem&~anchorBit,value[anchor]);
    }
    if (!componentsValid(all,k)) throw Error('The board has disconnected parts that cannot form equal-population districts.');
    recurse(all,0,0,[]);
    if(!best) return {ok:false,reason:stopped?'Search budget reached without a complete valid partition. Try Solve again with a higher search budget.':'No valid district partition found.',expanded,millis:Date.now()-started};
    const assignment=Array(tiles.length).fill(-1);
    best.parts.forEach((mask,d)=>{let x=mask;while(x){const b=x&-x; assignment[active[bitId.get(b)].old]=d; x^=b;}});
    const stats=best.parts.map((mask,i)=>({...scoreDistrict(mask),district:i+1}));
    return {ok:true,assignment,stats,horseWins:best.horseWins,winCounts:best.winCounts,horseLeads:best.horseLeads,districts:k,quota,expanded,millis:Date.now()-started,optimal:!stopped&&!targetHit,
      warning:!best.horseLeads?'No horse victory found within the search budget. You can try Deep search.':targetHit?'':stopped?'Winning solution found; not guaranteed to maximize horse seats.':''};
  }
  scope.ElectSolver = {solve};
  if(typeof module!=='undefined' && module.exports)module.exports=scope.ElectSolver;
})(typeof self==='undefined'?globalThis:self);
