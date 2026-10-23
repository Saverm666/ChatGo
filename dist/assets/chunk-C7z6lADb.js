import{ai as v,aa as u,p as A}from"./chunk-UChlLmmp.js";/**
 * @license @lucide/vue v1.21.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const h=t=>t==="";/**
 * @license @lucide/vue v1.21.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const S=(...t)=>t.filter((e,r,o)=>!!e&&e.trim()!==""&&o.indexOf(e)===r).join(" ").trim();/**
 * @license @lucide/vue v1.21.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const w=t=>t.replace(/([a-z0-9])([A-Z])/g,"$1-$2").toLowerCase();/**
 * @license @lucide/vue v1.21.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const L=t=>t.replace(/^([A-Z])|[\s-_]+(\w)/g,(e,r,o)=>o?o.toUpperCase():r.toLowerCase());/**
 * @license @lucide/vue v1.21.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const W=t=>{const e=L(t);return e.charAt(0).toUpperCase()+e.slice(1)};/**
 * @license @lucide/vue v1.21.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var s={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":2,"stroke-linecap":"round","stroke-linejoin":"round"};/**
 * @license @lucide/vue v1.21.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const $=Symbol("lucide-icons");function j(){return v($,{})}/**
 * @license @lucide/vue v1.21.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const E=({name:t,iconNode:e,absoluteStrokeWidth:r,"absolute-stroke-width":o,strokeWidth:i,"stroke-width":k,size:c,color:p,...C},{slots:l})=>{const{size:n,color:f,strokeWidth:m=2,absoluteStrokeWidth:g=!1,class:x=""}=j(),b=A(()=>{const a=h(r)||h(o)||r===!0||o===!0||g===!0,d=i||k||m||s["stroke-width"];return a?Number(d)*24/Number(c??n??s.width):d});return u("svg",{...s,...C,width:c??n??s.width,height:c??n??s.height,stroke:p??f??s.stroke,"stroke-width":b.value,class:S("lucide",x,...t?[`lucide-${w(W(t))}-icon`,`lucide-${w(t)}`]:["lucide-icon"])},[...e.map(a=>u(...a)),...l.default?[l.default()]:[]])};/**
 * @license @lucide/vue v1.21.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const U=(t,e)=>(r,{slots:o,attrs:i})=>u(E,{...i,...r,iconNode:e,name:t},o.default?{default:o.default}:void 0);export{U as c};
