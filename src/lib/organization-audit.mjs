const MAX_LIMIT=100,DEFAULT_LIMIT=30;
export function buildOrganizationAuditQuery(input={}) {
 if(!input||typeof input!=="object"||Array.isArray(input))throw new TypeError("Audit query must be an object");
 if(typeof input.organizationId!=="string"||!input.organizationId.trim())return {where:{id:"__no_organization__"},take:0,orderBy:[{createdAt:"desc"},{id:"desc"}]};
 const where={organizationId:input.organizationId.trim()};
 for(const key of ["eventType","actorUserId","projectId"])if(typeof input[key]==="string"&&input[key].trim())where[key]=input[key].trim().slice(0,128);
 if(input.from instanceof Date||input.to instanceof Date){where.createdAt={};if(input.from instanceof Date)where.createdAt.gte=input.from;if(input.to instanceof Date)where.createdAt.lte=input.to;}
 const n=Number(input.limit),take=Number.isSafeInteger(n)&&n>0?Math.min(n,MAX_LIMIT):DEFAULT_LIMIT;
 return {where,take,orderBy:[{createdAt:"desc"},{id:"desc"}]};
}
export function summarizeOrganizationAuditEvent(event) {
 if(!event||typeof event!=="object"||typeof event.id!=="string"||typeof event.organizationId!=="string"||typeof event.eventType!=="string"||typeof event.resourceType!=="string"||typeof event.resourceId!=="string")return null;
 let metadata={};if(typeof event.metadata==="string"&&event.metadata.length<=8000){try{const parsed=JSON.parse(event.metadata);if(parsed&&typeof parsed==="object"&&!Array.isArray(parsed))metadata=parsed;}catch{}}
 return {id:event.id,eventType:event.eventType,resourceType:event.resourceType,resourceId:event.resourceId,projectId:typeof event.projectId==="string"?event.projectId:null,summary:typeof event.summary==="string"?event.summary.slice(0,240):"",metadata,actor:event.actor&&typeof event.actor.id==="string"?{id:event.actor.id,displayName:typeof event.actor.displayName==="string"?event.actor.displayName.slice(0,120):""}:null,createdAt:event.createdAt??null};
}
