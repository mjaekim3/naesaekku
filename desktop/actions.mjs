export function createActions({studio,setKey,saveFile}){
  return {
    state:()=>studio.state(),
    importPhotos:files=>studio.importPhotos(files),
    importArtwork:file=>studio.importArtwork(file),
    asset:async id=>{const a=await studio.asset(id);return `data:${a.mime};base64,${a.buffer.toString('base64')}`;},
    pixelPreview:async id=>{const a=await studio.export(id,'pixel');return `data:${a.mime};base64,${a.buffer.toString('base64')}`;},
    start:r=>studio.start(r),job:id=>studio.job(id),cancel:id=>studio.cancel(id),
    saveKey:async r=>{if(!r||typeof r.key!=='string'||r.key.length>512||(r.key!==''&&r.key.length<12)||typeof r.remember!=='boolean')throw Error('유효한 API 키를 입력해주세요.');await setKey(r);return {ok:true};},
    export:async r=>{const result=await studio.export(r.id,r.format,r.blinkId);return saveFile(result,r);},
  };
}
