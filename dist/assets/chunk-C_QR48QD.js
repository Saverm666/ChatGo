const o=new Set,t={open(e){o.forEach(r=>r(e))},close(){o.forEach(e=>e(null))},on(e){return o.add(e),()=>{o.delete(e)}}};export{t as e};
