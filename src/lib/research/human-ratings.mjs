import { createHash } from "node:crypto";

export const RATING_FIELDS = Object.freeze(["coverage","grounding","relevance","specificity","dialect_fit","non_redundancy","overall","confidence"]);
export const QUALITY_FIELDS = Object.freeze(RATING_FIELDS.filter((field) => field !== "confidence"));
export const RATER_COLUMNS = Object.freeze(["rater_code","scenario_id","blind_output_id","category","domain","difficulty","brief","evidence_json","questions_json",...RATING_FIELDS.map((field)=>field+"_1_5"),"notes"]);
export const PLANNER_ARMS = Object.freeze(["single_shot","random","llm","impact_aware"]);

function seededRandom(seed){let s=2166136261;for(let i=0;i<seed.length;i++){s^=seed.charCodeAt(i);s=Math.imul(s,16777619);}if(!s)s=0x6d2b79f5;return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return(s>>>0)/4294967296;};}
function shuffle(items,rng){const out=[...items];for(let i=out.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;}
function keyOf(row){return String(row.scenario_id||"")+"::"+String(row.blind_output_id||"");}
function ratingValue(row,field){const raw=row[field+"_1_5"];if(raw===undefined||raw===null||raw==="")return null;const value=Number(raw);return Number.isInteger(value)&&value>=1&&value<=5?value:null;}
function mean(values){return values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null;}
function quantile(values,p){if(!values.length)return null;const x=(values.length-1)*p,l=Math.floor(x),u=Math.ceil(x);return l===u?values[l]:values[l]+(values[u]-values[l])*(x-l);}
function bootstrapCI(values,rng,n=5000){if(values.length<2)return values.length?{lower:values[0],upper:values[0]}:{lower:null,upper:null};const samples=[];for(let i=0;i<n;i++){let total=0;for(let j=0;j<values.length;j++)total+=values[Math.floor(rng()*values.length)];samples.push(total/values.length);}samples.sort((a,b)=>a-b);return{lower:quantile(samples,.025),upper:quantile(samples,.975)};}
function permutationP(values,rng,n=20000){if(!values.length)return null;const observed=Math.abs(mean(values));if(values.every(v=>v===0))return 1;let extreme=0;for(let i=0;i<n;i++){let total=0;for(const value of values)total+=(rng()<.5?-1:1)*value;if(Math.abs(total/values.length)>=observed-1e-12)extreme++;}return(extreme+1)/(n+1);}
function rankBiserial(values){const rows=values.map(value=>({value,abs:Math.abs(value)})).filter(row=>row.abs>0).sort((a,b)=>a.abs-b.abs);if(!rows.length)return 0;let positive=0,negative=0;for(let i=0;i<rows.length;){let end=i+1;while(end<rows.length&&rows[end].abs===rows[i].abs)end++;const rank=(i+1+end)/2;for(let j=i;j<end;j++){if(rows[j].value>0)positive+=rank;else negative+=rank;}i=end;}return(positive-negative)/(positive+negative);}
function holm(rows){const valid=rows.filter(row=>Number.isFinite(row.pValue)).sort((a,b)=>a.pValue-b.pValue);let prior=0;for(let i=0;i<valid.length;i++){prior=Math.max(prior,Math.min(1,(valid.length-i)*valid[i].pValue));valid[i].pAdjustedHolm=prior;}}

export function serializeCsv(rows,columns){
 const escape=(value)=>{const text=value===null||value===undefined?"":String(value);return /[",\r\n]/.test(text)?'"'+text.replace(/"/g,'""')+'"':text;};
 return [columns.map(escape).join(","),...rows.map(row=>columns.map(column=>escape(row[column])).join(","))].join("\r\n")+"\r\n";
}
export function parseCsv(input){
 const text=String(input||"").replace(/^\uFEFF/,"");const rows=[];let row=[],cell="",quoted=false;
 for(let i=0;i<text.length;i++){const ch=text[i];if(quoted){if(ch==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(ch==='"')quoted=false;else cell+=ch;}else if(ch==='"'&&cell==="")quoted=true;else if(ch===","){row.push(cell);cell="";}else if(ch==="\n"){row.push(cell.replace(/\r$/,""));if(row.some(value=>value!==""))rows.push(row);row=[];cell="";}else cell+=ch;}
 if(quoted)throw new Error("CSV contains an unterminated quoted field");if(cell!==""||row.length){row.push(cell.replace(/\r$/,""));if(row.some(value=>value!==""))rows.push(row);}
 if(!rows.length)return[];const headers=rows[0];return rows.slice(1).map(values=>Object.fromEntries(headers.map((header,index)=>[header,values[index]??""])));
}

export function weightedQuadraticKappa(left,right,maxScore=5){
 const pairs=[];for(let i=0;i<Math.min(left.length,right.length);i++){const a=Number(left[i]),b=Number(right[i]);if(Number.isInteger(a)&&a>=1&&a<=maxScore&&Number.isInteger(b)&&b>=1&&b<=maxScore)pairs.push([a,b]);}
 const n=pairs.length;if(!n)return{n,kappa:null,exactAgreement:null,withinOne:null};
 const observed=Array.from({length:maxScore},()=>Array(maxScore).fill(0)),row=Array(maxScore).fill(0),col=Array(maxScore).fill(0);
 for(const [a,b] of pairs){observed[a-1][b-1]++;row[a-1]++;col[b-1]++;}
 let observedDisagreement=0,expectedDisagreement=0,exact=0,within=0;
 for(let i=0;i<maxScore;i++)for(let j=0;j<maxScore;j++){const weight=((i-j)/(maxScore-1))**2;observedDisagreement+=(observed[i][j]/n)*weight;expectedDisagreement+=(row[i]/n)*(col[j]/n)*weight;}
 for(const [a,b] of pairs){if(a===b)exact++;if(Math.abs(a-b)<=1)within++;}
 return{n,kappa:expectedDisagreement===0?(observedDisagreement===0?1:null):1-observedDisagreement/expectedDisagreement,exactAgreement:exact/n,withinOneAgreement:within/n};
}

export function buildBlindPackets(records,loadScenario,options={}){
 const seed=options.seed||"modrik-human-rating-"+Date.now();const errors=[];const scenarios=new Set();const keyRows=[];const byRater={R1:[],R2:[]};
 for(const record of records){
  if(record?.status!=="success"||typeof record.scenarioId!=="string") {errors.push("Only successful benchmark records with scenarioId can be packeted");continue;}
  if(scenarios.has(record.scenarioId)){errors.push("Duplicate scenario in human-rating source: "+record.scenarioId);continue;}scenarios.add(record.scenarioId);
  const arms=Array.isArray(record.arms)?record.arms:[];const map=new Map(arms.map(arm=>[arm.arm,arm]));
  if(map.size!==4||PLANNER_ARMS.some(arm=>!map.has(arm))){errors.push(record.scenarioId+": expected exactly four planner arms");continue;}
  const scenario=loadScenario(record.scenarioId);if(!scenario||scenario.id!==record.scenarioId){errors.push(record.scenarioId+": scenario fixture is missing or mismatched");continue;}
  const evidence=(Array.isArray(scenario.evidence)?scenario.evidence:[]).filter(item=>item.consent===true).map(item=>({code:item.code,title:item.title,sourceType:item.sourceType,language:item.language,content:item.content}));
  if(!evidence.length){errors.push(record.scenarioId+": no explicitly consented evidence is available for raters");continue;}
  const rows=[];
  for(const armName of PLANNER_ARMS){
   const arm=map.get(armName);if(!Array.isArray(arm.questions)||!arm.questions.length){errors.push(record.scenarioId+": arm "+armName+" has no questions");continue;}
   const blindId="BR-"+createHash("sha256").update(seed+"|"+record.scenarioId+"|"+armName).digest("hex").slice(0,12).toUpperCase();
   keyRows.push({scenario_id:record.scenarioId,blind_output_id:blindId,arm:armName});
   const questions=arm.questions.map(question=>({text:question.text,rationale:question.rationale,priority:question.priority,askCost:question.askCost,fallbackAssumption:question.fallbackAssumption,language:question.language})).filter(question=>typeof question.text==="string"&&question.text.trim());
   if(!questions.length){errors.push(record.scenarioId+": arm "+armName+" has no renderable question text");continue;}
   rows.push({scenario_id:record.scenarioId,blind_output_id:blindId,category:scenario.category,domain:scenario.domain,difficulty:scenario.difficulty,brief:scenario.brief,evidence_json:JSON.stringify(evidence),questions_json:JSON.stringify(questions)});
  }
  for(const rater of ["R1","R2"]){const randomized=shuffle(rows,seededRandom(seed+":"+record.scenarioId+":"+rater));for(const row of randomized)byRater[rater].push({rater_code:rater,...row,...Object.fromEntries(RATING_FIELDS.map(field=>[field+"_1_5",""])),notes:""});}
 }
 if(errors.length)throw new Error("Cannot create blind packets:\n- "+errors.join("\n- "));
 const rng1=seededRandom(seed+":order:R1"),rng2=seededRandom(seed+":order:R2");
 byRater.R1=shuffle(byRater.R1,rng1);byRater.R2=shuffle(byRater.R2,rng2);
 return{seed,scenarioCount:scenarios.size,rowsPerRater:byRater.R1.length,raters:byRater,answerKey:keyRows};
}

export function analyzeHumanRatings(rater1Rows,rater2Rows,answerKeyRows,options={}){
 const minScenarios=Number.isInteger(options.minScenarios)&&options.minScenarios>=2?options.minScenarios:10;
 const index=(rows,label)=>{const map=new Map();for(const row of rows){const key=keyOf(row);if(!row.scenario_id||!row.blind_output_id)throw new Error(label+" row is missing scenario_id or blind_output_id");if(map.has(key))throw new Error(label+" contains duplicate output "+key);map.set(key,row);}return map;};
 const left=index(rater1Rows,"Rater 1"),right=index(rater2Rows,"Rater 2"),keyMap=new Map();
 for(const row of answerKeyRows){const key=keyOf(row);if(!PLANNER_ARMS.includes(row.arm))throw new Error("Answer key contains unknown arm for "+key);if(keyMap.has(key))throw new Error("Answer key contains duplicate output "+key);keyMap.set(key,row.arm);}
 const matched=[...left.keys()].filter(key=>right.has(key));if(!matched.length)throw new Error("No matching blind outputs exist between the two rater files");
 const interRater={};
 for(const field of RATING_FIELDS){const a=[],b=[];for(const key of matched){const x=ratingValue(left.get(key),field),y=ratingValue(right.get(key),field);if(x!==null&&y!==null){a.push(x);b.push(y);}}interRater[field]=weightedQuadraticKappa(a,b);}
 const adjudicationQueue=[];
 for(const key of matched){const a=left.get(key),b=right.get(key);for(const field of QUALITY_FIELDS){const x=ratingValue(a,field),y=ratingValue(b,field);if(x!==null&&y!==null&&Math.abs(x-y)>1)adjudicationQueue.push({scenario_id:a.scenario_id,blind_output_id:a.blind_output_id,metric:field,rater1:x,rater2:y,absolute_difference:Math.abs(x-y)});}}
 const keyed=[];
 for(const key of matched){if(!keyMap.has(key))throw new Error("Answer key is missing blind output "+key);const a=left.get(key),b=right.get(key);keyed.push({scenarioId:a.scenario_id,blindOutputId:a.blind_output_id,arm:keyMap.get(key),scores:Object.fromEntries(RATING_FIELDS.map(field=>{const x=ratingValue(a,field),y=ratingValue(b,field);return[field,x!==null&&y!==null?(x+y)/2:null];}))});}
 const completeByScenario=new Map();
 for(const row of keyed){if(!completeByScenario.has(row.scenarioId))completeByScenario.set(row.scenarioId,new Map());const group=completeByScenario.get(row.scenarioId);if(group.has(row.arm))throw new Error("Duplicate arm rating for scenario "+row.scenarioId);group.set(row.arm,row);}
 const complete=[...completeByScenario.entries()].filter(([,group])=>PLANNER_ARMS.every(arm=>group.has(arm)));
 const armSummary={};
 for(const arm of PLANNER_ARMS){armSummary[arm]={};for(const field of QUALITY_FIELDS){const values=keyed.filter(row=>row.arm===arm&&row.scores[field]!==null).map(row=>row.scores[field]);armSummary[arm][field]={n:values.length,mean:values.length?+(mean(values).toFixed(3)):null};}}
 const comparisons=[];
 for(const field of QUALITY_FIELDS){const rows=[];for(const comparator of PLANNER_ARMS.filter(arm=>arm!=="impact_aware")){const differences=complete.map(([,group])=>{const a=group.get("impact_aware").scores[field],b=group.get(comparator).scores[field];return a!==null&&b!==null?a-b:null;}).filter(value=>value!==null);if(differences.length<minScenarios){rows.push({metric:field,comparator,n:differences.length,meanImprovement:mean(differences),ci95:null,pValue:null,pAdjustedHolm:null,rankBiserial:null,verdict:"insufficient-data"});continue;}const rng=seededRandom((options.seed||"modrik-human-ratings-v1")+":"+field+":"+comparator),ci95=bootstrapCI(differences,rng),pValue=permutationP(differences,rng);rows.push({metric:field,comparator,n:differences.length,meanImprovement:+mean(differences).toFixed(3),ci95,pValue,rankBiserial:rankBiserial(differences),verdict:ci95.lower>0?"evidence-of-improvement":ci95.upper<0?"evidence-of-regression":"inconclusive"});}holm(rows);comparisons.push(...rows);}
 return{schemaVersion:1,scenarioCount:complete.length,matchedOutputCount:matched.length,unmatchedRater1:left.size-matched.length,unmatchedRater2:right.size-matched.length,minScenarios,interRater,armSummary,comparisons,adjudicationQueue,limitations:"Quadratic weighted kappa is descriptive for two raters. The human rating set is exploratory until raters are trained, blind, and adjudication is documented. A small pilot cannot support confirmatory claims."};
}
