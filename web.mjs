import {compare} from './src/diff.mjs';import {markdown,sarif} from './src/report.mjs';
const $=id=>document.getElementById(id);let result=null,lang='en';
const inputVersions={before:0,after:0};
const ar={eyebrow:'راجع التغيير. واحتفظ بالقرار.',intro:'إيه اتغيّر في صلاحيات الوكيل؟ قارن ملفي إعدادات مع أدلة على مستوى السطور. التحليل بيتم داخل المتصفح.',sample:'جرّب المثال الجاهز',format:'صيغة الإعدادات',before:'الإعدادات قبل التغيير',after:'الإعدادات بعد التغيير',compare:'قارن الصلاحيات',privacy:'بدون حساب أو موديل أو رفع إعدادات. التقارير لا تتضمن قيم الإعدادات، بما فيها الأسرار.',ready:'حمّل المثال أو أضف ملفي JSON للبدء.',scope:'نفحص التغييرات المعلنة، وليس الوصول الفعلي. الإعدادات الأخرى وخيارات التشغيل وسلوك الخادم وروابط الملفات قد تغيّر النتيجة. الحقول غير المدعومة موضحة صراحة.'};
const en=Object.fromEntries([...document.querySelectorAll('[data-t]')].map(e=>[e.dataset.t,e.textContent]));
function clear(){result=null;$('exportText').value='';$('exportPreview').hidden=true;$('findings').replaceChildren();$('status').textContent=(lang==='ar'?ar:en).ready;for(const x of ['json','md','sarif'])$(x).disabled=true;}
function render(){if(!result)return;$('status').textContent=lang==='ar'?`${result.findings.length} تغييرات · ${result.verdict==='review_required'?'تحتاج مراجعة':'لا توجد تغييرات بمستوى المراجعة'} · ${result.coverage.status==='partial'?'التغطية جزئية':'الحقول المدعومة فقط'}`:`${result.findings.length} changes · ${result.verdict} · Coverage: ${result.coverage.status}`;$('findings').replaceChildren();for(const f of result.findings){const box=document.createElement('div');box.className='finding';const title=document.createElement('strong');title.textContent=`${f.severity.toUpperCase()} / ${f.code}`;const p=document.createElement('p');p.textContent=f.message;const loc=document.createElement('small');loc.textContent=lang==='ar'?`السطر قبل التغيير: ${f.evidence.before.line} ← بعد التغيير: ${f.evidence.after.line}`:`Before line ${f.evidence.before.line} → After line ${f.evidence.after.line}`;box.append(title,p,loc);$('findings').appendChild(box);}for(const x of ['json','md','sarif'])$(x).disabled=false;}
$('lang').onclick=()=>{lang=lang==='en'?'ar':'en';document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';$('lang').textContent=lang==='ar'?'English':'العربية';document.querySelectorAll('[data-t]').forEach(e=>e.textContent=(lang==='ar'?ar:en)[e.dataset.t]);render();};
$('sample').onclick=()=>{inputVersions.before++;inputVersions.after++;const a={permissions:{allow:['Read(./docs/**)'],deny:['Read(./.env)'],ask:['Bash'],additionalDirectories:['/project/docs'],defaultMode:'default'}};const b={permissions:{allow:['Read(./docs/**)','Bash(*)'],deny:[],ask:[],additionalDirectories:['/project'],defaultMode:'bypassPermissions'}};$('before').value=JSON.stringify(a,null,2);$('after').value=JSON.stringify(b,null,2);$('format').value='auto';clear();};
for(const [file,editor]of [['fileBefore','before'],['fileAfter','after']])$(file).onchange=async()=>{
  const version=++inputVersions[editor];
  clear();const f=$(file).files[0];if(!f)return;$(editor).value='';
  if(f.size>2000000){$('status').textContent='File exceeds 2 MB.';return;}
  try{
    const text=new TextDecoder('utf-8',{fatal:true}).decode(await f.arrayBuffer());
    if(version!==inputVersions[editor])return;
    $(editor).value=text;clear();
  }catch{
    if(version===inputVersions[editor])$('status').textContent='File must contain valid UTF-8 JSON.';
  }
};
for(const x of ['before','after'])$(x).oninput=()=>{inputVersions[x]++;clear();};$('format').onchange=clear;
$('compare').onclick=()=>{clear();try{result=compare($('before').value,$('after').value,{format:$('format').value});render();}catch(e){$('status').textContent=(lang==='ar'?'خطأ في المدخلات: ':'Input error: ')+e.message;}};
for(const [button,format]of [['json','json'],['md','md'],['sarif','sarif']])$(button).onclick=()=>{if(!result)return;const text=format==='md'?markdown(result):JSON.stringify(format==='sarif'?sarif(result):result,null,2);$('exportText').value=text;$('exportPreview').hidden=false;$('exportPreview').open=true;const url=URL.createObjectURL(new Blob([text],{type:format==='md'?'text/markdown':'application/json'}));const a=document.createElement('a');a.href=url;a.download=`monna-permission-diff.${format}`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);};
