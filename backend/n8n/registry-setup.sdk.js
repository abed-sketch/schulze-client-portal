import {workflow,node,trigger} from '@n8n/workflow-sdk';
const start=trigger({type:'n8n-nodes-base.manualTrigger',version:1,config:{name:'Initialize portal access storage'},output:[{}]});
const table=node({type:'n8n-nodes-base.dataTable',version:1.1,config:{name:'Create portal grants table if absent',parameters:{resource:'table',operation:'create',tableName:'schulzePortalGrants',columns:{column:[{name:'tokenHash',type:'string'},{name:'clientRecordId',type:'string'},{name:'expiresAt',type:'date'},{name:'revokedAt',type:'date'},{name:'scope',type:'string'}]},options:{createIfNotExists:true}}},output:[{}]});
export default workflow('schulze-portal-storage','Schulze Portal · Initialize access registry').add(start).to(table);
