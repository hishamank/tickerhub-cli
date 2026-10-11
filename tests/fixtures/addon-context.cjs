// Standalone diagnostic of GC across V8 contexts; not an application fix.
const Database = require(process.argv[2]);
const mode = process.argv[3];
const db = new Database(':memory:');
db.exec('CREATE TABLE t (v INTEGER); INSERT INTO t VALUES (1)');
for(let i=0;i<200;i++) db.prepare('SELECT v FROM t').get();
console.error('STATEMENTS_CREATED_DB_OPEN');
if(mode === 'fetch') {
  // Built-in fetch initialization only: data URL performs no remote request.
  fetch('data:text/plain,probe').then(r=>r.text()).then(()=>{console.error('FETCH_DONE');db.close();console.log('DONE');});
} else if(mode === 'vm') {
  // Collect unreachable native statements while another context is active.
  require('node:vm').runInNewContext(`
    const held=[];
    for(let batch=0;batch<100;batch++) {
      const a=[];
      for(let i=0;i<2000;i++) a.push({i,text:'allocation-'+i+'-'+batch,payload:[i,batch,i*batch]});
      if(batch%10===0) held.push(a);
    }
  `);
  console.error('VM_DONE');db.close();console.log('DONE');
}
