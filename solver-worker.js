importScripts('solver.js');
self.onmessage = e => {
  const {board,k,options} = e.data;
  try {self.postMessage({type:'result',result:self.ElectSolver.solve(board,k,options)});}
  catch(err){self.postMessage({type:'error',message:String(err.message||err)});}
};
