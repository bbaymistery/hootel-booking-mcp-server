async function test() {
  const res = await fetch('http://localhost:3001/api/availability?check_in=2026-11-02&check_out=2026-11-06&guests=2');
  const data = await res.json();
  console.log('Available rooms count:', data.rooms?.length);
  console.log('Available rooms:', data.rooms?.map((r: any) => r.name));
  console.log('Unavailable rooms count:', data.unavailable_rooms?.length);
  console.log('Unavailable rooms:', data.unavailable_rooms?.map((u: any) => ({
    name: u.name,
    reason: u.reason,
    next_date: u.next_available_date,
    msg: u.reason_message
  })));
}
test().catch(console.error);
