/* Runs only when the user invokes the extension on the game tab. */
(function () {
  'use strict';
  if (window.__ELECT_HORSE_AUTODISTRICT__) return;
  window.__ELECT_HORSE_AUTODISTRICT__=true;
  let svg=null, cancelled=false, saved=null;
  function scaleCoord(board, t) {
    // captureVisibleTab gives device pixels; mouse events use CSS pixels.
    return {x: t.x * window.innerWidth/board.width,y: t.y * window.innerHeight/board.height};
  }
  function hide() { cancelled=true; if(svg){svg.remove();svg=null;} }
  function polygonVertices(t, scaleR) {
    return Array.from({length:6},(_,i)=>{
      const angle=(-90+60*i)*Math.PI/180;
      return [t.x+scaleR*Math.cos(angle),t.y+scaleR*Math.sin(angle)];
    });
  }
  function preview(board, assignment) {
    hide();cancelled=false;
    saved={board,assignment};
    const width=window.innerWidth,height=window.innerHeight;
    const factorX=width/board.width,factorY=height/board.height;
    const ns='http://www.w3.org/2000/svg';
    svg=document.createElementNS(ns,'svg');
    svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
    svg.setAttribute('width',String(width));svg.setAttribute('height',String(height));
    svg.setAttribute('aria-label','Elect Horse solver district boundaries');
    svg.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483646;';
    const radius=board.dx/Math.sqrt(3);
    const palette=['#fbbf24','#c084fc','#34d399','#fb923c','#60a5fa','#f472b6','#a3e635','#e879f9','#facc15','#67e8f9','#fca5a5','#a7f3d0'];
    const pts=board.tiles.map((t)=>polygonVertices(t,radius).map(([x,y])=>[x*factorX,y*factorY]));
    for(let i=0;i<board.tiles.length;i++){
      const district=assignment[i];if(district<0)continue;
      const polygon=document.createElementNS(ns,'polygon');
      polygon.setAttribute('points',pts[i].map(a=>a.join(',')).join(' '));
      polygon.setAttribute('fill',palette[district%palette.length]);
      polygon.setAttribute('fill-opacity','.22');
      svg.appendChild(polygon);
    }
    for(let i=0;i<board.tiles.length;i++){
      const district=assignment[i];if(district<0)continue;
      const verts=pts[i];
      for(let e=0;e<6;e++){
        const a=verts[e],b=verts[(e+1)%6];
        const x=(a[0]+b[0])/2, y=(a[1]+b[1])/2;
        const c=scaleCoord(board,board.tiles[i]);
        const neighborPt={x:2*x-c.x,y:2*y-c.y};
        const neighbor=board.tiles.findIndex((t,j)=>j!==i && Math.hypot(scaleCoord(board,t).x-neighborPt.x,scaleCoord(board,t).y-neighborPt.y)<board.dx*factorX*.24);
        if(neighbor>=0 && assignment[neighbor]===district)continue;
        const line=document.createElementNS(ns,'line');
        line.setAttribute('x1',a[0]);line.setAttribute('y1',a[1]);line.setAttribute('x2',b[0]);line.setAttribute('y2',b[1]);
        line.setAttribute('stroke',palette[district%palette.length]);
        line.setAttribute('stroke-width','5');
        line.setAttribute('stroke-linecap','round');
        svg.appendChild(line);
      }
    }
    document.documentElement.appendChild(svg);
    return {ok:true,info:'Boundary overlay drawn.'};
  }
  const pause=t=>new Promise(resolve=>setTimeout(resolve,t));
  function mouseAt(x,y) {
    const node=document.elementFromPoint(x,y);
    if(!node)return false;
    const base={bubbles:true,cancelable:true,composed:true,clientX:x,clientY:y,screenX:window.screenX+x,screenY:window.screenY+y,button:0,buttons:1,view:window};
    try{node.dispatchEvent(new PointerEvent('pointerdown',{...base,pointerId:1,pointerType:'mouse',isPrimary:true}));}catch(e){}
    node.dispatchEvent(new MouseEvent('mousedown',base));
    node.dispatchEvent(new MouseEvent('mouseup',{...base,buttons:0}));
    try{node.dispatchEvent(new PointerEvent('pointerup',{...base,buttons:0,pointerId:1,pointerType:'mouse',isPrimary:true}));}catch(e){}
    node.dispatchEvent(new MouseEvent('click',{...base,buttons:0,detail:1}));
    return true;
  }
  async function place(board, assignment) {
    if(!assignment || !board)throw Error('Preview a solved board first.');
    cancelled=false;
    const districts=Math.max(...assignment)+1;
    let sent=0;
    const visited=new Set();
    for(let d=0;d<districts;d++) {
      const cells=board.tiles.map((t,i)=>i).filter(i=>assignment[i]===d);
      if(!cells.length)continue;
      const starting=cells[0],queue=[starting],seen=new Set([starting]);
      // Click from an initial cell and then its adjacent, connected cells.
      const order=[];
      while(queue.length){
        const i=queue.shift();order.push(i);
        for(const j of board.tiles[i].neighbors){if(assignment[j]===d && !seen.has(j)){seen.add(j);queue.push(j);}}
      }
      if(order.length!==cells.length)throw Error(`District ${d+1} is disconnected; refusing to apply.`);
      for(const i of order){
        if(cancelled) return {ok:false,reason:'Cancelled',sent};
        const p=scaleCoord(board,board.tiles[i]);
        if(p.y<0 || p.y>window.innerHeight || p.x<0 || p.x>window.innerWidth)throw Error('Some tiles are off-screen; zoom out and recapture.');
        if(mouseAt(p.x,p.y))sent++;
        await pause(75); // allow React/canvas handlers to update state
      }
      await pause(110);
    }
    return {ok:true,sent,verified:false,info:'Synthetic clicks dispatched but NOT verified by the game. Inspect the board manually.'};
  }
  chrome.runtime.onMessage.addListener((m,sender,sendResponse)=>{
    if(m.type==='ELECT_PREVIEW') {sendResponse(preview(m.board,m.assignment));return;}
    if(m.type==='ELECT_CLEAR'){hide();sendResponse({ok:true});return;}
    if(m.type==='ELECT_GET_STATE'){sendResponse({ok:true,saved});return;}
    if(m.type==='ELECT_PLACE'){
      place(m.board,m.assignment).then(sendResponse).catch(e=>sendResponse({ok:false,reason:e.message}));return true;
    }
  });
})();
