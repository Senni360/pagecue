const db = new Promise((resolve,reject)=>{
  const request=indexedDB.open('pagecue-audio',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('files');
  request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error);
});
export async function audioStore(method,key,value) {
  const database=await db;
  return new Promise((resolve,reject)=>{
    const tx=database.transaction('files',method==='get'?'readonly':'readwrite');
    const store=tx.objectStore('files'); const request=method==='put'?store.put(value,key):store[method](key);
    tx.oncomplete=()=>resolve(request.result); tx.onerror=()=>reject(tx.error); tx.onabort=()=>reject(tx.error);
  });
}
