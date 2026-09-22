const baseUrl=(process.env.SOLPIENT_RESEARCH_SUPABASE_URL||"https://hmfrlpsjszjpvzogrico.supabase.co").replace(/\/$/,"");
const key=process.env.SOLPIENT_RESEARCH_PUBLISHABLE_KEY||"sb_publishable_KVgQDNO-qAJAZ4KN8F1eCA_xOeEqw0m";
const tickers=["ADBE","DECK","PFE"];
const params=new URLSearchParams({
  select:"ticker,research_version,overall_score,base_value,thesis_health,evidence_confidence_score,risks,what_changed,standard_status",
  ticker:`in.(${tickers.join(",")})`,
});
const response=await fetch(`${baseUrl}/rest/v1/money_research_snapshots_v1?${params}`,{
  headers:{apikey:key,Accept:"application/json"},
});
if(!response.ok){
  throw new Error(`Research contract HTTP ${response.status}: ${(await response.text()).slice(0,300)}`);
}
const rows=await response.json();
const byTicker=new Map(rows.map(row=>[row.ticker,row]));
for(const ticker of tickers){
  const row=byTicker.get(ticker);
  if(!row) throw new Error(`Missing live Research row for ${ticker}`);
  if(row.standard_status!=="complete") throw new Error(`${ticker} latest published Research is not complete`);
  if(!Number.isFinite(Number(row.overall_score))) throw new Error(`${ticker} missing overall_score`);
  if(!Number.isFinite(Number(row.base_value))) throw new Error(`${ticker} missing base_value`);
  if(!Number.isFinite(Number(row.evidence_confidence_score))) throw new Error(`${ticker} missing evidence_confidence_score`);
  if(!Array.isArray(row.risks)) throw new Error(`${ticker} risks is not an array`);
  if(typeof row.thesis_health!=="string") throw new Error(`${ticker} missing thesis_health`);
}
console.log("Live Solpient Research contract OK:",rows.map(row=>({
  ticker:row.ticker,
  version:row.research_version,
  score:Number(row.overall_score),
  fairValue:Number(row.base_value),
  evidenceConfidence:Number(row.evidence_confidence_score),
  thesis:row.thesis_health,
  risks:row.risks.length,
  changes:Array.isArray(row.what_changed)?row.what_changed.length:0,
})));
