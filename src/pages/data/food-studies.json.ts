import { foodStudies } from '../../lib/food-evidence';
export function GET() { return new Response(JSON.stringify({synthetic:true,description:'Extracted counts and computed estimates from six fictional household trials.',studies:foodStudies},null,2), {headers:{'Content-Type':'application/json; charset=utf-8'}}); }
