import { publicRecords } from '../../lib/evidence';
export function GET() {
  return new Response(JSON.stringify(publicRecords, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
