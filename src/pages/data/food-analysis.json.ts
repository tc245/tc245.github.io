import { foodAnalysis } from '../../lib/food-evidence';
export function GET() { return new Response(JSON.stringify(foodAnalysis,null,2), {headers:{'Content-Type':'application/json; charset=utf-8'}}); }
