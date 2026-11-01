'use strict';
const $=id=>document.getElementById(id);
let board=null, solution=null, worker=null, tabId=null;
const palette=['#fbc84e','#ba8df1','#50d6a1','#ff9758','#5aa6ed','#fb83ac','#b3e55b'];
function status(msg,error=false){$('status').textContent=msg;$('status').className=error?'error':'';}
function countBoard(){
  if(!board)return;
  const counts={horse:0,cow:0,donkey:0,goat:0,water:0,empty:0};
  for(const t of board.tiles){if(t.kind===1)counts.horse++;else if(t.kind===2)counts.cow++;else if(t.kind===3)counts.donkey++;else if(t.kind===4)counts.goat++;else if(t.kind===-1)counts.water++;else counts.empty++;}
  board.total=counts.horse+counts.cow+counts.donkey+counts.goat;
  $('stats').textContent=`Detected ${board.tiles.length} hexes · ${counts.horse} horse · ${counts.cow} cow · ${counts.donkey} donkey · ${counts.goat} goat · ${counts.water} water · ${counts.empty} empty`;
  const candidates=Array.from({length:11},(_,i)=>i+2).filter(k=>board.total%k===0);
  const select=$('districts');
  for(const o of select.options){o.disabled=!candidates.includes(+o.value);}
  if(!candidates.includes(+select.value) || (board.total===48 && select.value==='3')){select.value=String(board.total===48&&candidates.includes(8)?8:candidates.includes(3)?3:candidates[0]||2);}
}
function drawMini(){
  if(!board)return;
  const svg=$('board');svg.style.display='block';$('legend').hidden=false;
  svg.replaceChildren();
  const tiles=board.tiles;
  const minx=Math.min(...tiles.map(t=>t.x)),maxx=Math.max(...tiles.map(t=>t.x));
  const miny=Math.min(...tiles.map(t=>t.y)),maxy=Math.max(...tiles.map(t=>t.y));
  const margin=22;
  const scale=Math.min(358/(maxx-minx+board.dx),180/(maxy-miny+board.dx));
  const x0=200-(minx+maxx)*scale/2,y0=105-(miny+maxy)*scale/2;
  const r=board.dx/Math.sqrt(3)*scale;
  const ns='http://www.w3.org/2000/svg';
  for(let i=0;i<tiles.length;i++){
    const t=tiles[i]; const cx=t.x*scale+x0,cy=t.y*scale+y0;
    const pts=Array.from({length:6},(_,a)=>[cx+r*Math.cos((a*60-90)*Math.PI/180),cy+r*Math.sin((a*60-90)*Math.PI/180)]);
    const hex=document.createElementNS(ns,'polygon');
    hex.setAttribute('points',pts.map(p=>p.join(',')).join(' '));
    const col=solution && solution.assignment[i]>=0 ? palette[solution.assignment[i]%palette.length] : '#1b7345';
    hex.setAttribute('fill',col);hex.setAttribute('fill-opacity',solution?'.53':'.78');
    hex.setAttribute('stroke','#99bda3');hex.setAttribute('stroke-width','1');
    hex.addEventListener('click',()=>{
      if(worker) {status('Wait for the current solve to finish before editing the board.');return;}
      t.kind=({[-1]:0,0:1,1:2,2:3,3:4,4:-1})[t.kind];
      solution=null; $('place').disabled=true;countBoard();drawMini();
      status('Tile corrected. Solve again to update the boundaries.');
    });
    svg.appendChild(hex);
    if(t.kind!==0){
      const mark=document.createElementNS(ns,t.kind===-1?'rect':'circle');
      if(t.kind===-1){mark.setAttribute('x',cx-r*.37);mark.setAttribute('y',cy-r*.35);mark.setAttribute('width',r*.75);mark.setAttribute('height',r*.7);mark.setAttribute('rx','3');mark.setAttribute('fill','#062f48');}
      else {mark.setAttribute('cx',cx);mark.setAttribute('cy',cy);mark.setAttribute('r',r*.30);mark.setAttribute('fill',t.kind===1?'#5fd3ff':t.kind===2?'#ff4d6d':t.kind===3?'#b58cff':'#f4dc73');}
      mark.setAttribute('pointer-events','none');svg.appendChild(mark);
    }
  }
}
function send(message){return new Promise((resolve,reject)=>{
  chrome.tabs.sendMessage(tabId,message,res=>{
    const err=chrome.runtime.lastError;
    if(err)reject(Error(err.message)); else resolve(res);
  });
});}
async function ensureTab(){
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(!tab?.id || !/^https:\/\/(?:www\.)?elect\.horse(?:\/|$)/.test(tab.url||''))
    throw Error('Open https://elect.horse in the active tab first.');
  tabId=tab.id;
  return tab;
}
async function inject(){await chrome.scripting.executeScript({target:{tabId},files:['content.js']});}
$('scan').addEventListener('click',async()=>{
  try {
    $('scan').disabled=true;$('solve').disabled=true;$('place').disabled=true;
    if(worker){worker.terminate();worker=null;}
    solution=null;status('Capturing your visible game board…');
    await ensureTab();await inject();
    await send({type:'ELECT_CLEAR'}); // avoid capturing our own previous overlay
    const url=await chrome.tabs.captureVisibleTab(undefined,{format:'png'});
    const image=new Image();image.src=url;await image.decode();
    const canv=document.createElement('canvas');canv.width=image.naturalWidth;canv.height=image.naturalHeight;
    const ctx=canv.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
    board=ElectParser.identifyBoard(ctx.getImageData(0,0,canv.width,canv.height));
    countBoard();drawMini();$('solve').disabled=false;
    status('Verify voter counts against the game; the parser is heuristic and does not read the game source. Review the mini-board. Click a tile to cycle: empty → horse → cow → donkey → goat → water. Choose the district count shown in the game.');
  } catch(e){board=null;status('Capture failed: '+e.message,true);}finally{$('scan').disabled=false;}
});
$('solve').addEventListener('click',async()=>{
  if(!board)return;
  try {
    await ensureTab();await inject();
    const k=Number($('districts').value);
    if(board.total%k)throw Error(`${board.total} voters cannot form ${k} equal-population districts.`);
    if(worker){worker.terminate();worker=null;}
    solution=null;$('place').disabled=true;
    $('solve').disabled=true;status(`Searching for ${k} connected districts with ${board.total/k} voters apiece…`);
    worker=new Worker('solver-worker.js');
    const opt=$('effort').value==='deep'?{maxStates:12000000,maxMillis:30000,maxCandidatesPerDistrict:90000}:{maxStates:1250000,maxMillis:7500,maxCandidatesPerDistrict:18000};
    worker.onmessage=async evt=>{
      const w=worker;worker=null;w.terminate();$('solve').disabled=false;
      if(evt.data.type==='error'){status('Solver error: '+evt.data.message,true);return;}
      const res=evt.data.result;
      if(!res.ok){$('results').style.display='none';status(res.reason+` Explored ${res.expanded.toLocaleString()} states.`,true);return;}
      solution=res;drawMini();
      const output=res.stats.map(s=>`D${s.district}: ${s.counts[1]||0} horse / ${s.counts[2]||0} cow / ${s.counts[3]||0} donkey / ${s.counts[4]||0} goat → ${['tie','HORSE','cow','donkey','goat'][s.winner]||'other'}`).join('<br>');
      $('results').style.display='block';$('results').innerHTML=`<strong>${res.horseLeads?'Horse leads!':'No horse win yet'} · ${res.horseWins}/${k} horse seats</strong> · ${res.expanded.toLocaleString()} states · ${(res.millis/1000).toFixed(1)}s<br>${output}`;
      try {
        const p=await send({type:'ELECT_PREVIEW',board,assignment:res.assignment});
        if(!p?.ok)throw Error(p?.reason||'No response');
        $('place').disabled=false;
        status(res.warning || 'Color-coded district boundaries are overlaid on the game. Press Auto-place to try entering them automatically.');
      }catch(e){status('Solved! But overlay could not be drawn: '+e.message,true);}
    };
    worker.onerror=e=>{worker?.terminate();worker=null;$('solve').disabled=false;status('Search failed: '+e.message,true);};
    worker.postMessage({board,k,options:opt});
  }catch(e){$('solve').disabled=false;status(e.message,true);}
});
$('place').addEventListener('click',async()=>{
  if(!solution||!board)return;
  try {
    $('place').disabled=true;await ensureTab();await inject();
    status('Sending clicks to the game. Keep the board in place and do not scroll or change zoom.');
    const response=await send({type:'ELECT_PLACE',board,assignment:solution.assignment});
    if(!response?.ok)throw Error(response?.reason||'The page did not respond');
    status(`${response.sent} clicks dispatched. Inspect the actual game to confirm the districts took effect. This extension does not press Submit.`);
  }catch(e){status('Auto-place failed: '+e.message,true);}finally{$('place').disabled=false;}
});
$('clear').addEventListener('click',async()=>{
  try{await ensureTab();await send({type:'ELECT_CLEAR'});status('Overlay hidden. Clicks already applied to the game are not undone.');}
  catch(e){status('Could not clear overlay: '+e.message,true);}
});

// Chrome closes an extension popup when focus shifts to the page. Recover
// the last preview from the content script when the popup is reopened.
(async function restorePreviousPreview(){
  try {
    await ensureTab();await inject();
    const response=await send({type:'ELECT_GET_STATE'});
    if(response?.saved?.board && response?.saved?.assignment) {
      board=response.saved.board;
      const asg=response.saved.assignment;
      solution={assignment:asg};
      countBoard();drawMini();
      $('solve').disabled=false;$('place').disabled=false;
      status('Previous solution restored from this tab. Click Auto-place to enter it or Capture board to rescan.');
    }
  } catch(e){/* Open the target site then capture a board normally. */}
})();
