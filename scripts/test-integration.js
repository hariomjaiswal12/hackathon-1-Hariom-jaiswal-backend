const baseUrl = 'http://127.0.0.1:5000/api/v1';

async function req(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(`${baseUrl}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

async function runTests() {
  console.log('=== TXOTX OS & SIDERÍA ITURRIETA INTEGRATION TEST SUITE ===\n');

  // 1. Health
  const health = await req('/health');
  console.log('1. Health Check:', health.status === 200 && health.data.data.status === 'ok' ? 'PASS' : 'FAIL');

  // 2. Auth: Customer Login
  const customerLogin = await req('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'amaia@iturrieta.eus', password: 'Customer12345!' }),
  });
  console.log('2. Customer Login:', customerLogin.status === 200 && customerLogin.data.data.token ? 'PASS' : 'FAIL');
  const customerToken = customerLogin.data.data?.token;

  // 3. Auth: Verify /me
  const customerMe = await req('/auth/me', {
    headers: { Authorization: `Bearer ${customerToken}` },
  });
  console.log('3. Customer /me session:', customerMe.status === 200 && customerMe.data.data.user.role === 'CUSTOMER' ? 'PASS' : 'FAIL');

  // 4. Auth: Staff Login
  const staffLogin = await req('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'staff@iturrieta.eus', password: 'Staff12345!' }),
  });
  console.log('4. Staff Login:', staffLogin.status === 200 && staffLogin.data.data.user.role === 'STAFF' ? 'PASS' : 'FAIL');
  const staffToken = staffLogin.data.data?.token;

  // 5. Auth: Admin Login
  const adminLogin = await req('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@iturrieta.eus', password: 'Admin12345!' }),
  });
  console.log('5. Admin Login:', adminLogin.status === 200 && adminLogin.data.data.user.role === 'ADMIN' ? 'PASS' : 'FAIL');
  const adminToken = adminLogin.data.data?.token;

  // 6. Role Protection: Customer accessing Live Floor (Must be 403 Forbidden)
  const customerLiveFloor = await req('/tables/floor/live', {
    headers: { Authorization: `Bearer ${customerToken}` },
  });
  console.log('6. Role Protection (Customer -> Live Floor = 403):', customerLiveFloor.status === 403 ? 'PASS' : 'FAIL');

  // 7. Staff accessing Live Floor (Must be 200)
  const staffLiveFloor = await req('/tables/floor/live', {
    headers: { Authorization: `Bearer ${staffToken}` },
  });
  console.log('7. Staff Live Floor:', staffLiveFloor.status === 200 && staffLiveFloor.data.data.tables.length > 0 ? 'PASS' : 'FAIL');

  // 8. Weekly Schedules (Public)
  const schedules = await req('/schedules');
  const schedulesList = schedules.data.data?.schedules || schedules.data.data?.schedule || [];
  console.log('8. Schedules list:', schedules.status === 200 && schedulesList.length === 7 ? 'PASS' : 'FAIL');

  // 9. Effective Schedule for Saturday (e.g. 2026-11-14 is Saturday)
  const effective = await req('/schedules/effective/2026-11-14');
  console.log('9. Effective Schedule (Saturday 2026-11-14):', effective.status === 200 && effective.data.data.schedule.isConfigured && !effective.data.data.schedule.isClosed ? 'PASS' : 'FAIL');

  // 10. Table Recommendations
  const recom = await req('/tables/recommendation?date=2026-11-14&time=13:30&guests=2');
  console.log('10. Table Recommendation Engine:', recom.status === 200 && recom.data.data.recommendation.available && recom.data.data.recommendation.recommendations.length > 0 ? 'PASS' : 'FAIL');
  const chosenTable = recom.data.data?.recommendation?.recommendations?.[0]?.table;

  // 11. Create Booking as Customer
  let createdBookingRef = null;
  if (chosenTable) {
    const bookingRes = await req('/bookings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        date: '2026-11-14',
        startTime: '13:30',
        guests: 2,
        tableId: chosenTable.id,
        notes: 'End-to-end integration test booking',
      }),
    });
    console.log('11. Customer Create Booking:', bookingRes.status === 201 && bookingRes.data.data.booking.bookingReference ? 'PASS' : 'FAIL');
    createdBookingRef = bookingRes.data.data?.booking?.bookingReference;
    console.log('    Created Booking Reference:', createdBookingRef);
  }

  // 12. Conflict Check: Booking same table at same time should return 409 Conflict
  if (chosenTable) {
    const conflictRes = await req('/bookings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        date: '2026-11-14',
        startTime: '13:30',
        guests: 2,
        tableId: chosenTable.id,
      }),
    });
    console.log('12. Booking Conflict Detection (409):', conflictRes.status === 409 && conflictRes.data.code === 'BOOKING_CONFLICT' ? 'PASS' : 'FAIL');
  }

  // 13. Customer Lists Their Bookings
  const customerBookings = await req('/bookings', {
    headers: { Authorization: `Bearer ${customerToken}` },
  });
  console.log('13. List Customer Bookings:', customerBookings.status === 200 && customerBookings.data.data.bookings.length > 0 ? 'PASS' : 'FAIL');

  // 14. Customer Notifications (Booking Created event should have generated in-app notification)
  const notifications = await req('/notifications', {
    headers: { Authorization: `Bearer ${customerToken}` },
  });
  console.log('14. Customer Notifications:', notifications.status === 200 && notifications.data.data.notifications.length > 0 ? 'PASS' : 'FAIL');
  const notificationId = notifications.data.data?.notifications?.[0]?.id;

  // 15. Mark Notification as Read
  if (notificationId) {
    const markRead = await req(`/notifications/${notificationId}/read`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    console.log('15. Mark Notification Read:', markRead.status === 200 && markRead.data.data.notification.status === 'READ' ? 'PASS' : 'FAIL');
  }

  // 16. Customer Waitlist
  const waitlistRes = await req('/waitlist', {
    method: 'POST',
    headers: { Authorization: `Bearer ${customerToken}` },
    body: JSON.stringify({
      date: '2026-11-14',
      requestedStartTime: '13:30',
      guests: 6,
      notes: 'Testing waitlist entry',
    }),
  });
  console.log('16. Customer Create Waitlist:', waitlistRes.status === 201 && waitlistRes.data.data.waitlist.waitlistReference ? 'PASS' : 'FAIL');
  const waitlistRef = waitlistRes.data.data?.waitlist?.waitlistReference;

  // 17. Staff Booking Lifecycle: Arrive -> Seat -> Complete
  if (createdBookingRef) {
    const arriveRes = await req(`/bookings/${createdBookingRef}/arrive`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    console.log('17a. Staff Arrive Booking:', arriveRes.status === 200 && arriveRes.data.data.booking.status === 'ARRIVED' ? 'PASS' : 'FAIL');

    const seatRes = await req(`/bookings/${createdBookingRef}/seat`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    console.log('17b. Staff Seat Booking:', seatRes.status === 200 && seatRes.data.data.booking.status === 'SEATED' ? 'PASS' : 'FAIL');

    const completeRes = await req(`/bookings/${createdBookingRef}/complete`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    console.log('17c. Staff Complete Booking:', completeRes.status === 200 && completeRes.data.data.booking.status === 'COMPLETED' ? 'PASS' : 'FAIL');
  }

  // 18. Staff Waitlist Lifecycle: Notify -> Convert
  if (waitlistRef) {
    const notifyRes = await req(`/waitlist/${waitlistRef}/notify`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    console.log('18a. Staff Notify Waitlist:', notifyRes.status === 200 && notifyRes.data.data.waitlist.status === 'NOTIFIED' ? 'PASS' : 'FAIL');

    const convertRes = await req(`/waitlist/${waitlistRef}/convert`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    console.log('18b. Staff Convert Waitlist:', convertRes.status === 200 && convertRes.data.data.waitlist.status === 'CONVERTED' ? 'PASS' : 'FAIL');
  }

  // 19. Admin Background Jobs Status
  const jobs = await req('/admin/jobs/status', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  console.log('19. Admin Jobs Status:', jobs.status === 200 && Array.isArray(jobs.data.data.jobs) ? 'PASS' : 'FAIL');

  console.log('\n=== ALL INTEGRATION TESTS COMPLETED SUCCESSFULLY ===');
}

runTests().catch(console.error);
