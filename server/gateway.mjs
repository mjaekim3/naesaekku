import http from 'node:http';
import {timingSafeEqual} from 'node:crypto';
export async function createGateway({studio,token,port=0}){
  if(!token)throw new Error('Gateway token required');
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
    const given=Buffer.from(req.headers.authorization||''),wanted=Buffer.from(`Bearer ${token}`);
    if(given.length!==wanted.length||!timingSafeEqual(given,wanted))return send(401,{error:'인증이 필요합니다.'});
    const path=new URL(req.url,'http://127.0.0.1').pathname;
    try{
      if(req.method==='GET'&&path==='/api/state')return send(200,await studio.state());
      if(req.method==='GET'&&path.startsWith('/api/asset/')){const a=await studio.asset(path.slice(11));res.writeHead(200,{'Content-Type':a.mime});return res.end(a.buffer);}
      if(req.method==='GET'&&path.startsWith('/api/job/')){const j=studio.job(path.slice(9));return send(j?200:404,j||{error:'작업을 찾을 수 없습니다.'});}
      if(req.method!=='POST'||!['/api/import','/api/artwork','/api/generate','/api/cancel','/api/export'].includes(path))return send(404,{error:'Not found'});
      let size=0;const parts=[];for await(const chunk of req){size+=chunk.length;if(size>140*1024*1024){send(413,{error:'파일이 너무 큽니다.'});return;}parts.push(chunk);}let body;try{body=JSON.parse(Buffer.concat(parts));}catch{return send(400,{error:'요청 형식을 확인해주세요.'});}
      if(path==='/api/import')return send(200,await studio.importPhotos(body.files?.map(f=>({name:f.name,bytes:Buffer.from(f.base64||'','base64')}))));
      if(path==='/api/artwork')return send(200,await studio.importArtwork({name:body.name,bytes:Buffer.from(body.base64||'','base64')}));
      if(path==='/api/generate')return send(200,await studio.start(body));
      if(path==='/api/cancel'){studio.cancel(body.id);return send(200,{ok:true});}
      const out=await studio.export(body.id,body.format,body.blinkId);res.writeHead(200,{'Content-Type':out.mime});res.end(out.buffer);
    }catch(e){send(400,{error:e.message});}
  });
  await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
  return {url:`http://127.0.0.1:${server.address().port}`,close:()=>new Promise(resolve=>server.close(resolve))};
}
