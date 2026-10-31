/* Image-only hex detection. No reliance on private elect.horse game state. */
(function (scope) {
  'use strict';
  const median = items => {
    const a=items.slice().sort((x,y)=>x-y),n=a.length;
    return n ? (a[Math.floor((n-1)/2)]+a[Math.floor(n/2)])/2 : 0;
  };
  function pixelClass(r,g,b) {
    // The three saturated pixel-art voter colors. Require a fairly close
    // palette match to avoid grass, highlights, outlines and UI text.
    if(r>50 && r<150 && g>165 && b>205 && b>g*1.1) return 1; // horse
    if(r>205 && g>=38 && g<160 && b>=55 && b<185 && r>g*1.5) return 2; // cow
    if(r>125 && r<225 && g>85 && g<190 && b>200 && b>g*1.2 && b>r*1.15) return 3; // donkey
    return 0;
  }
  function isPond(r,g,b) {
    return r<36 && g>=23 && g<95 && b>=49 && b<145 && b>g*1.13;
  }
  function identifyBoard(image) {
    const {width:w,height:h,data}=image, n=w*h;
    if(w<280||h<280)throw Error('Capture is too small. Show the whole game and try again.');
    const classes=new Uint8Array(n), ponds=new Uint8Array(n);
    for(let i=0,p=0;i<n;i++,p+=4){
      const r=data[p],g=data[p+1],b=data[p+2];
      classes[i]=pixelClass(r,g,b);
      ponds[i]=isPond(r,g,b)?1:0;
    }
    function findComponents(mask){
      const seen=new Uint8Array(n), queue=new Int32Array(n),found=[];
      for(let i=0;i<n;i++){
        if(!mask[i]||seen[i])continue;
        const cls=mask[i]; let front=0,back=1,size=0,sx=0,sy=0;
        let left=w,right=0,top=h,bottom=0;
        seen[i]=1;queue[0]=i;
        while(front<back){
          const p=queue[front++],y=Math.floor(p/w),x=p-y*w;
          size++;sx+=x;sy+=y;
          if(x<left)left=x;if(x>right)right=x;
          if(y<top)top=y;if(y>bottom)bottom=y;
          if(x&&mask[p-1]===cls&&!seen[p-1]){seen[p-1]=1;queue[back++]=p-1;}
          if(x<w-1&&mask[p+1]===cls&&!seen[p+1]){seen[p+1]=1;queue[back++]=p+1;}
          if(y&&mask[p-w]===cls&&!seen[p-w]){seen[p-w]=1;queue[back++]=p-w;}
          if(y<h-1&&mask[p+w]===cls&&!seen[p+w]){seen[p+w]=1;queue[back++]=p+w;}
        }
        const cw=right-left+1,ch=bottom-top+1;
        if(size>45&&cw>7&&ch>7&&cw/ch>.65&&cw/ch<1.5 && cw<w/4&&ch<h/4)
          found.push({x:sx/size,y:sy/size,kind:cls,area:size,w:cw,h:ch});
      }
      return found;
    }
    // Select the largest cluster of nearly identically-sized symbols. This
    // excludes miniature legend markers and larger decorative artwork.
    const raw=findComponents(classes).sort((a,b)=>a.area-b.area);
    let cluster=[],clusterScore=0;
    for(const c of raw){
      const group=raw.filter(v=>v.area>=c.area*.77&&v.area<=c.area*1.3 && v.w>=c.w*.75&&v.w<=c.w*1.3);
      const score=group.length*Math.sqrt(c.area);
      if(group.length>=6&&score>clusterScore){cluster=group;clusterScore=score;}
    }
    let dots=cluster.slice();
    if(dots.length<8)throw Error('Could not find the voter symbols. Keep the full board visible and try again.');
    const dotWidth=median(dots.map(d=>d.w));
    // Pond components are roughly 2.3 times a voter width. Include them as
    // lattice anchors, which fixes layouts with gaps between adjacent voters.
    const waterRaw=findComponents(ponds);
    const waters=waterRaw.filter(v=>v.w>dotWidth*1.65 && v.w<dotWidth*3.2 &&
      v.h>dotWidth*1.7&&v.h<dotWidth*3.7 && v.area>median(dots.map(d=>d.area))*3);
    const anchors=dots.concat(waters.map(v=>({...v,kind:-1}))).sort((a,b)=>a.y-b.y);
    const rows=[];
    for(const a of anchors){
      let row=rows.find(r=>Math.abs(a.y-r.y)<dotWidth*.43);
      if(!row){row={y:a.y,points:[]};rows.push(row);}
      row.points.push(a);row.y=median(row.points.map(p=>p.y));
    }
    rows.sort((a,b)=>a.y-b.y);
    if(rows.length<3)throw Error('Unable to detect enough rows of hexagons.');
    const gaps=rows.slice(1).map((r,i)=>r.y-rows[i].y).filter(d=>d>dotWidth*.8);
    // Use the smaller gaps (some entire rows may have no visible voters).
    const gapsSorted=gaps.sort((a,b)=>a-b);
    const dy=median(gapsSorted.slice(0,Math.max(1,Math.ceil(gapsSorted.length*.65))));
    if(dy<=dotWidth*1.2)throw Error('Could not infer vertical hex spacing.');
    const dx=2*dy/Math.sqrt(3);
    if(dx<=dotWidth*1.45)throw Error('Could not infer hex spacing.');
    const firstY=rows[0].y;
    const rowCount=Math.round((rows[rows.length-1].y-firstY)/dy)+1;
    if(rowCount>26||rowCount<3)throw Error('Unexpected number of hex rows.');
    // Pick a global column phase; adjacent rows shift by half a column.
    const xOrigin=rows[0].points[0].x;
    const rowCenters=Array.from({length:rowCount},(_,r)=>firstY+r*dy);
    for(const a of anchors){
      const r=Math.round((a.y-firstY)/dy);
      if(r>=0&&r<rowCount&&Math.abs(a.y-rowCenters[r])<dy*.35){
        // Use the median observed y coordinate to resist fractional scaling.
      }
    }
    for(let r=0;r<rowCount;r++){
      const matched=anchors.filter(a=>Math.abs(a.y-rowCenters[r])<dy*.30);
      if(matched.length)rowCenters[r]=median(matched.map(a=>a.y));
    }
    function goodLine(ix,iy){
      if(ix<0||iy<0||ix>=w||iy>=h)return false;
      const p=(iy*w+ix)*4,r=data[p],g=data[p+1],b=data[p+2];
      return r>=44&&r<=122&&g>=113&&g<=180&&b>=65&&b<=160&&g-r>34&&b-r>12;
    }
    function hasHexOutline(x,y){
      // Six edge midpoints of a pointy-top hexagon. A false empty gap between
      // surrounding tiles normally has only 2–4 edges, not all six.
      let sides=0;
      for(const [a,b] of [[-.5,0],[.5,0],[-.25,-.5],[.25,-.5],[-.25,.5],[.25,.5]]){
        const px=Math.round(x+a*dx),py=Math.round(y+b*dy);
        let hits=0;
        for(let q=-7;q<=7;q+=2){
          for(let z=-7;z<=7;z+=2){
            if(goodLine(px+q,py+z)){hits++; if(hits>=2)break;}
          }
          if(hits>=2)break;
        }
        if(hits>=2)sides++;
      }
      return sides>=5;
    }
    const tiles=[];
    for(let r=0;r<rowCount;r++){
      const y=rowCenters[r], rowAnchors=anchors.filter(a=>Math.abs(a.y-y)<dy*.30);
      if(!rowAnchors.length)throw Error('An entire hex row is hidden. Show the full board.');
      const phase=xOrigin+(r%2)*dx/2;
      const cols=rowAnchors.map(a=>Math.round((a.x-phase)/dx));
      const lo=Math.min(...cols)-2,hi=Math.max(...cols)+2;
      if(hi-lo>26)throw Error('Unexpected board width.');
      for(let col=lo;col<=hi;col++){
        const x=phase+col*dx;
        if(x<dx*.48||x>w-dx*.48||y<dy*.55||y>h-dy*.55)continue;
        const match=rowAnchors.find(a=>Math.abs(a.x-x)<dx*.28);
        // Correct coordinate drift caused by fractional canvas / browser zoom.
        const cx=match?.x??x;
        const kind=match?.kind??0;
        if(!match&&!hasHexOutline(cx,y))continue;
        tiles.push({x:cx,y,row:r,col,kind,neighbors:[]});
      }
    }
    // Verify detection against the known voter symbols. Never silently solve
    // a board where some voter tiles were discarded by geometry calibration.
    const matchedDots=dots.filter(a=>tiles.some(t=>t.kind===a.kind&&Math.hypot(t.x-a.x,t.y-a.y)<dx*.24));
    if(matchedDots.length<dots.length)throw Error(`Only ${matchedDots.length}/${dots.length} voters aligned with the grid. Try 100% zoom.`);
    // Board graph includes 6 neighbors: two horizontal and four diagonal.
    for(let i=0;i<tiles.length;i++)for(let j=i+1;j<tiles.length;j++){
      const a=tiles[i],b=tiles[j];
      if(Math.abs(Math.hypot(a.x-b.x,a.y-b.y)-dx)<dx*.18){a.neighbors.push(j);b.neighbors.push(i);}
    }
    const total=tiles.filter(t=>t.kind>0).length;
    if(total<8)throw Error('Too few voters detected.');
    if(tiles.some(t=>t.kind!==-1 && t.neighbors.length===0))throw Error('An isolated hex was detected; check that the entire board is visible.');
    return {tiles,width:w,height:h,dx,dy,rows:rowCount,total,
      waters:tiles.filter(t=>t.kind===-1).length,
      blue:tiles.filter(t=>t.kind===1).length,
      red:tiles.filter(t=>t.kind===2).length,
      purple:tiles.filter(t=>t.kind===3).length};
  }
  scope.ElectParser={identifyBoard};
  if(typeof module!=='undefined'&&module.exports)module.exports=scope.ElectParser;
})(typeof self==='undefined'?globalThis:self);
