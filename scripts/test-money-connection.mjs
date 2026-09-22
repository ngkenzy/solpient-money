const baseUrl=(process.env.NEXT_PUBLIC_MONEY_SUPABASE_URL||"https://lvbkyxnptohcwqtuxxxh.supabase.co").replace(/\/$/,"");
const key=process.env.NEXT_PUBLIC_MONEY_SUPABASE_PUBLISHABLE_KEY||"sb_publishable_WuuXjwPMHnohCu3D9WSP0w_ydWGaEyJ";

const authHealth=await fetch(`${baseUrl}/auth/v1/health`,{
  headers:{apikey:key,Accept:"application/json"},
});
if(!authHealth.ok){
  throw new Error(`Money Auth health failed: HTTP ${authHealth.status}`);
}

for(const table of ["accounts","transactions","holdings","goals"]){
  const response=await fetch(`${baseUrl}/rest/v1/${table}?select=id&limit=1`,{
    headers:{apikey:key,Accept:"application/json"},
  });
  if(response.ok){
    throw new Error(`Anonymous client unexpectedly read private Money table: ${table}`);
  }
  if(![401,403].includes(response.status)){
    throw new Error(`Unexpected anonymous response for ${table}: HTTP ${response.status} ${(await response.text()).slice(0,200)}`);
  }
}

console.log("Solpient Money live connection OK; anonymous financial-table reads are blocked.");
