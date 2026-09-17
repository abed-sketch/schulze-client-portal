import { readFileSync } from 'node:fs';
import vm from 'node:vm';
export function readWorkflowConfig(path) {
 const nodes=[];
 const chain={add(){return this},to(){return this},onTrue(){return this},onFalse(){return this}};
 const make=v=>{nodes.push({type:v.type,version:v.version,...v.config});return Object.create(chain)};
 const source=readFileSync(path,'utf8').replace(/^import .*?;\n/,'').replace('export default workflow','workflow');
 vm.runInNewContext(source,{node:make,trigger:make,ifElse:v=>make({type:'n8n-nodes-base.if',...v}),workflow:()=>chain,expr:v=>'='+v,newCredential:(name,id)=>({name,id})});
 return nodes;
}
if(process.argv[1]?.endsWith('/read-workflow-config.mjs')) process.stdout.write(JSON.stringify(readWorkflowConfig(process.argv[2])));
