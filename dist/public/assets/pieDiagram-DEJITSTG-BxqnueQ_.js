import{g as K,s as Q,a as Y,b as tt,p as et,o as at,_ as d,l as F,c as rt,E as nt,H as it,N as st,d as ot,y as lt,F as ct}from"./mermaid.core-B_WTKjQ1.js";import{p as ut}from"./chunk-4BX2VUAB-_Wk3Qe_J.js";import{p as dt}from"./wardley-RL74JXVD-YC8mOPjg.js";import{f as y,t as R,r as pt,u as gt}from"./index-BCdC6x6b.js";import{d as I}from"./arc-C4HjBERR.js";import"./min-pjRqGXXF.js";import"./_baseUniq-pBYNROyG.js";function ft(t,a){return a<t?-1:a>t?1:a>=t?0:NaN}function ht(t){return t}function mt(){var t=ht,a=ft,f=null,S=y(0),s=y(R),p=y(0);function o(e){var n,l=(e=pt(e)).length,g,h,v=0,c=new Array(l),i=new Array(l),x=+S.apply(this,arguments),w=Math.min(R,Math.max(-R,s.apply(this,arguments)-x)),m,D=Math.min(Math.abs(w)/l,p.apply(this,arguments)),$=D*(w<0?-1:1),u;for(n=0;n<l;++n)(u=i[c[n]=n]=+t(e[n],n,e))>0&&(v+=u);for(a!=null?c.sort(function(A,C){return a(i[A],i[C])}):f!=null&&c.sort(function(A,C){return f(e[A],e[C])}),n=0,h=v?(w-l*$)/v:0;n<l;++n,x=m)g=c[n],u=i[g],m=x+(u>0?u*h:0)+$,i[g]={data:e[g],index:n,value:u,startAngle:x,endAngle:m,padAngle:D};return i}return o.value=function(e){return arguments.length?(t=typeof e=="function"?e:y(+e),o):t},o.sortValues=function(e){return arguments.length?(a=e,f=null,o):a},o.sort=function(e){return arguments.length?(f=e,a=null,o):f},o.startAngle=function(e){return arguments.length?(S=typeof e=="function"?e:y(+e),o):S},o.endAngle=function(e){return arguments.length?(s=typeof e=="function"?e:y(+e),o):s},o.padAngle=function(e){return arguments.length?(p=typeof e=="function"?e:y(+e),o):p},o}var vt=ct.pie,W={sections:new Map,showData:!1},T=W.sections,z=W.showData,xt=structuredClone(vt),yt=d(()=>structuredClone(xt),"getConfig"),St=d(()=>{T=new Map,z=W.showData,lt()},"clear"),wt=d(({label:t,value:a})=>{if(a<0)throw new Error(`"${t}" has invalid value: ${a}. Negative values are not allowed in pie charts. All slice values must be >= 0.`);T.has(t)||(T.set(t,a),F.debug(`added new section: ${t}, with value: ${a}`))},"addSection"),At=d(()=>T,"getSections"),Ct=d(t=>{z=t},"setShowData"),Dt=d(()=>z,"getShowData"),_={getConfig:yt,clear:St,setDiagramTitle:at,getDiagramTitle:et,setAccTitle:tt,getAccTitle:Y,setAccDescription:Q,getAccDescription:K,addSection:wt,getSections:At,setShowData:Ct,getShowData:Dt},$t=d((t,a)=>{ut(t,a),a.setShowData(t.showData),t.sections.map(a.addSection)},"populateDb"),Tt={parse:d(async t=>{const a=await dt("pie",t);F.debug(a),$t(a,_)},"parse")},Et=d(t=>`
  .pieCircle{
    stroke: ${t.pieStrokeColor};
    stroke-width : ${t.pieStrokeWidth};
    opacity : ${t.pieOpacity};
  }
  .pieOuterCircle{
    stroke: ${t.pieOuterStrokeColor};
    stroke-width: ${t.pieOuterStrokeWidth};
    fill: none;
  }
  .pieTitleText {
    text-anchor: middle;
    font-size: ${t.pieTitleTextSize};
    fill: ${t.pieTitleTextColor};
    font-family: ${t.fontFamily};
  }
  .slice {
    font-family: ${t.fontFamily};
    fill: ${t.pieSectionTextColor};
    font-size:${t.pieSectionTextSize};
    // fill: white;
  }
  .legend text {
    fill: ${t.pieLegendTextColor};
    font-family: ${t.fontFamily};
    font-size: ${t.pieLegendTextSize};
  }
`,"getStyles"),bt=Et,kt=d(t=>{const a=[...t.values()].reduce((s,p)=>s+p,0),f=[...t.entries()].map(([s,p])=>({label:s,value:p})).filter(s=>s.value/a*100>=1);return mt().value(s=>s.value).sort(null)(f)},"createPieArcs"),Mt=d((t,a,f,S)=>{F.debug(`rendering pie chart
`+t);const s=S.db,p=rt(),o=nt(s.getConfig(),p.pie),e=40,n=18,l=4,g=450,h=g,v=it(a),c=v.append("g");c.attr("transform","translate("+h/2+","+g/2+")");const{themeVariables:i}=p;let[x]=st(i.pieOuterStrokeWidth);x??=2;const w=o.textPosition,m=Math.min(h,g)/2-e,D=I().innerRadius(0).outerRadius(m),$=I().innerRadius(m*w).outerRadius(m*w);c.append("circle").attr("cx",0).attr("cy",0).attr("r",m+x/2).attr("class","pieOuterCircle");const u=s.getSections(),A=kt(u),C=[i.pie1,i.pie2,i.pie3,i.pie4,i.pie5,i.pie6,i.pie7,i.pie8,i.pie9,i.pie10,i.pie11,i.pie12];let E=0;u.forEach(r=>{E+=r});const N=A.filter(r=>(r.data.value/E*100).toFixed(0)!=="0"),b=gt(C).domain([...u.keys()]);c.selectAll("mySlices").data(N).enter().append("path").attr("d",D).attr("fill",r=>b(r.data.label)).attr("class","pieCircle"),c.selectAll("mySlices").data(N).enter().append("text").text(r=>(r.data.value/E*100).toFixed(0)+"%").attr("transform",r=>"translate("+$.centroid(r)+")").style("text-anchor","middle").attr("class","slice");const V=c.append("text").text(s.getDiagramTitle()).attr("x",0).attr("y",-400/2).attr("class","pieTitleText"),G=[...u.entries()].map(([r,M])=>({label:r,value:M})),k=c.selectAll(".legend").data(G).enter().append("g").attr("class","legend").attr("transform",(r,M)=>{const P=n+l,Z=P*G.length/2,q=12*n,J=M*P-Z;return"translate("+q+","+J+")"});k.append("rect").attr("width",n).attr("height",n).style("fill",r=>b(r.label)).style("stroke",r=>b(r.label)),k.append("text").attr("x",n+l).attr("y",n-l).text(r=>s.getShowData()?`${r.label} [${r.value}]`:r.label);const U=Math.max(...k.selectAll("text").nodes().map(r=>r?.getBoundingClientRect().width??0)),j=h+e+n+l+U,L=V.node()?.getBoundingClientRect().width??0,H=h/2-L/2,X=h/2+L/2,B=Math.min(0,H),O=Math.max(j,X)-B;v.attr("viewBox",`${B} 0 ${O} ${g}`),ot(v,g,O,o.useMaxWidth)},"draw"),Rt={draw:Mt},Pt={parser:Tt,db:_,renderer:Rt,styles:bt};export{Pt as diagram};
