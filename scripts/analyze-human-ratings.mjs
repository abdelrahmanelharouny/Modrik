import {readFile,mkdir,writeFile} from "node:fs/promises";
import {verifyHumanRatingArtifacts} from "../src/lib/research/human-ratings.mjs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {analyzeHumanRatings,parseCsv,serializeCsv,QUALITY_FIELDS} from "../src/lib/research/human-ratings.mjs";
const arg=(args,name,fallback)=>{const i=args.indexOf(name);return i>=0?args[i+1]:fallback;};
function markdown(report){
 const lines=["# Blind Human-Rating Analysis","","- Complete scenarios: "+report.scenarioCount,"- Matched outputs: "+report.matchedOutputCount,"- Unmatched Rater 1 rows: "+report.unmatchedRater1,"- Unmatched Rater 2 rows: "+report.unmatchedRater2,"","## Inter-rater agreement (quadratic weighted Cohen's kappa)","","| Dimension | n | Kappa | Exact agreement | Within-one agreement |","|---|---:|---:|---:|---:|"];
 for(const [field,row] of Object.entries(report.interRater)){lines.push("|"+[field,row.n,row.kappa===null?"—":row.kappa.toFixed(3),row.exactAgreement===null?"—":(row.exactAgreement*100).toFixed(1)+"%",row.withinOneAgreement===null?"—":(row.withinOneAgreement*100).toFixed(1)+"%"].join("|")+"|");}
 lines.push("","## Arm-level human scores","","| Arm | "+QUALITY_FIELDS.join(" | ")+" |","|---|"+QUALITY_FIELDS.map(()=>":---:").join("|")+"|");
 for(const [arm,metrics] of Object.entries(report.armSummary)){lines.push("|"+[arm,...QUALITY_FIELDS.map(field=>metrics[field].mean===null?"—":metrics[field].mean.toFixed(2))].join("|")+"|");}
 lines.push("","## Paired impact-aware contrasts","","Positive differences favour impact_aware. Inferential statistics are withheld below the minimum complete-scenario threshold.", "| Dimension | Comparator | n | Mean improvement | 95% bootstrap CI | p | Holm p | Verdict |","|---|---|---:|---:|---:|---:|---:|---|");
 for(const row of report.comparisons){const ci=row.ci95===null?"insufficient-data":"["+row.ci95.lower.toFixed(2)+", "+row.ci95.upper.toFixed(2)+"]";lines.push("|"+[row.metric,row.comparator,row.n,row.meanImprovement===null?"—":row.meanImprovement.toFixed(2),ci,row.pValue===null?"—":row.pValue.toFixed(4),row.pAdjustedHolm===null?"—":row.pAdjustedHolm.toFixed(4),row.verdict].join("|")+"|");}
 lines.push("","## Adjudication queue","","Rows below require a third-rater or consensus discussion: "+report.adjudicationQueue.length,"",report.limitations,"");
 return lines.join("\n");
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
 const args=process.argv.slice(2),r1=arg(args,"--rater1"),r2=arg(args,"--rater2"),key=arg(args,"--key"),manifestPath=arg(args,"--manifest");
 if(!r1||!r2||!key||!manifestPath){process.stderr.write("Usage: node scripts/analyze-human-ratings.mjs --rater1 <csv> --rater2 <csv> --key <answer-key.csv> --manifest <manifest.json> [--out <directory>]\n");process.exitCode=2;}
 else{try{const [a,b,k,m]=await Promise.all([r1,r2,key,manifestPath].map(file=>readFile(path.resolve(file),"utf8"))),manifest=JSON.parse(m),canonicalPath=path.resolve(path.dirname(manifestPath),manifest.canonicalPacket),canonicalPacketText=await readFile(canonicalPath,"utf8");verifyHumanRatingArtifacts({canonicalPacketText,rater1CsvText:a,rater2CsvText:b,answerKeyCsvText:k,manifest});const report=analyzeHumanRatings(parseCsv(a),parseCsv(b),parseCsv(k),{minScenarios:Number(arg(args,"--min-scenarios","10")),seed:arg(args,"--seed","modrik-human-ratings-v1")}),out=path.resolve(arg(args,"--out","bench/results/human-ratings-analysis"));await mkdir(out,{recursive:true});await writeFile(path.join(out,"report.json"),JSON.stringify(report,null,2)+"\n");await writeFile(path.join(out,"report.md"),markdown(report));await writeFile(path.join(out,"adjudication.csv"),serializeCsv(report.adjudicationQueue,["scenario_id","blind_output_id","metric","rater1","rater2","absolute_difference"]));process.stdout.write("Human-rating analysis complete for "+report.scenarioCount+" complete scenarios.\n");}catch(error){process.stderr.write("Human-rating analysis failed: "+(error instanceof Error?error.message:String(error))+"\n");process.exitCode=1;}}
}
