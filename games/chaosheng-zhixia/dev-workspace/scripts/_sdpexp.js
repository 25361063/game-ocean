const puppeteer=require('puppeteer-core');
(async()=>{
const b=await puppeteer.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:'new',protocolTimeout:120000,args:['--no-sandbox']});
const p=await b.newPage();
await p.goto('about:blank');
const res=await p.evaluate(async()=>{
  // 生成一份 offer，然后按不同变体重新 setRemoteDescription（同页另一个 pc 也可测 parse）
  const pc1=new RTCPeerConnection({iceServers:[]});
  pc1.createDataChannel('t');
  await pc1.setLocalDescription(await pc1.createOffer());
  const full=pc1.localDescription.sdp;
  const lines=full.split(/\r?\n/).filter(Boolean);
  const keep=/^(v=|o=|s=|t=|m=|c=|b=|a=mid:|a=ice-|a=fingerprint|a=setup|a=candidate|a=end-of-candidates|a=group|a=sctp-port|a=max-message-size|a=sendrecv|a=sendonly|a=recvonly|a=msid)/;
  const min=lines.filter(l=>keep.test(l)).join('\n');
  const out={};
  async function tryParse(name,sdp){
    try{
      const pc2=new RTCPeerConnection({iceServers:[]});
      await pc2.setRemoteDescription({type:'offer',sdp:sdp});
      out[name]='OK';
      pc2.close();
    }catch(e){ out[name]='FAIL: '+String(e.message||e).slice(0,90); }
  }
  await tryParse('full_crlf',full);
  await tryParse('min_lf',min);
  await tryParse('min_crlf',min.replace(/\n/g,'\r\n'));
  // 逐行二分定位：全量删掉某行后是否仍 OK——先测最可疑的 ice-options
  await tryParse('min_crlf_no_iceopts', min.split('\n').filter(l=>l.indexOf('ice-options')<0).join('\r\n'));
  return out;
});
console.log(JSON.stringify(res,null,1));
await b.close();})().catch(e=>{console.error('FATAL',e.message);process.exit(3);});
