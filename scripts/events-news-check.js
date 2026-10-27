/**
 * Events and news checks.
 * Uses its own API port and removes only the records it creates.
 */
const http = require('http');
const mongoose = require('mongoose');
const app = require('../src/app');
const env = require('../src/config/env');
const { connectDB, disconnectDB } = require('../src/config/db');
const { initializeRealtime, closeRealtime } = require('../src/services/realtime.service');

const PORT = 5093;
const BASE = `http://127.0.0.1:${PORT}/api/v1`;
const stamp = Date.now();
const eventSlug = `en18-${stamp}-tasting`;
const duplicateSlug = `en18-${stamp}-duplicate`;
const newsSlug = `en18-${stamp}-harvest`;
const results = [];

function record(name, pass, detail) {
  results.push({ name, pass: Boolean(pass), detail: detail || '' });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function api(path, options = {}) {
  const headers = { Accept: 'application/json' };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${BASE}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

async function login(email, password) {
  const response = await api('/auth/login', { method: 'POST', body: { email, password } });
  return response.data?.data || {};
}

function eventBody(overrides = {}) {
  return {
    title: `Harvest tasting ${stamp}`,
    slug: eventSlug,
    description: 'An evening of cider poured from the kupela.',
    shortDescription: 'Cider tasting in Aramaio.',
    location: 'Sidrería Iturrieta, Aramaio',
    startDate: '2026-12-01',
    endDate: '2026-12-01',
    startTime: '13:00',
    endTime: '16:00',
    ...overrides,
  };
}

async function cleanup() {
  if (!env.mongodbUri || mongoose.connection.readyState === 0) return;
  const slug = new RegExp(`^en18-${stamp}`);
  await mongoose.connection.db.collection('events').deleteMany({ slug });
  await mongoose.connection.db.collection('news').deleteMany({ slug });
}

async function main() {
  await connectDB();
  const server = http.createServer(app);
  initializeRealtime(server);
  await new Promise((resolve, reject) => {
    server.listen(PORT, (error) => (error ? reject(error) : resolve()));
  });

  try {
    const admin = await login('admin@iturrieta.eus', 'Admin12345!');
    const staff = await login('staff@iturrieta.eus', 'Staff12345!');
    const customerLogin = await api('/auth/register', {
      method: 'POST',
      body: { name: 'Events Guest', email: `en18-${stamp}@example.com`, password: 'Events18!pass' },
    });
    const customer = customerLogin.data?.data || {};
    if (!admin.token || !staff.token || !customer.token) throw new Error('Login failed');

    const created = await api('/admin/events', { method: 'POST', token: admin.token, body: eventBody() });
    const event = created.data?.data?.event;
    record('Admin can create event', created.status === 201 && event?.status === 'DRAFT' && event?.isPublished === false && event?.createdBy === admin.user?.id, `${created.status} ${event?.status || ''}`);

    const staffCreate = await api('/admin/events', { method: 'POST', token: staff.token, body: eventBody({ slug: `en18-${stamp}-staff` }) });
    const customerCreate = await api('/admin/events', { method: 'POST', token: customer.token, body: eventBody({ slug: `en18-${stamp}-customer` }) });
    record('Staff cannot create event', staffCreate.status === 403, String(staffCreate.status));
    record('Customer cannot create event', customerCreate.status === 403, String(customerCreate.status));

    const hidden = await api('/events');
    const hiddenSlug = await api(`/events/${eventSlug}`);
    record('Draft event is hidden publicly', hidden.status === 200 && !(hidden.data?.data?.events || []).some((item) => item.slug === eventSlug) && hiddenSlug.status === 404, String(hiddenSlug.status));

    const published = await api(`/admin/events/${event?.id}`, { method: 'PATCH', token: admin.token, body: { status: 'PUBLISHED' } });
    const publicList = await api('/events');
    const publicEvent = (publicList.data?.data?.events || []).find((item) => item.slug === eventSlug);
    record('Published event appears publicly', published.status === 200 && publicEvent?.title && !('createdBy' in publicEvent), published.data?.data?.event?.status || '');

    const bySlug = await api(`/events/${eventSlug}`);
    record('Event slug works', bySlug.status === 200 && bySlug.data?.data?.event?.slug === eventSlug, String(bySlug.status));

    const updated = await api(`/admin/events/${event?.id}`, {
      method: 'PATCH',
      token: admin.token,
      body: { title: `Updated tasting ${stamp}` },
    });
    record('Admin can update event', updated.status === 200 && updated.data?.data?.event?.title === `Updated tasting ${stamp}`, String(updated.status));

    const cancelled = await api(`/admin/events/${event?.id}`, { method: 'PATCH', token: admin.token, body: { status: 'CANCELLED' } });
    const afterCancel = await api('/events');
    record(
      'Admin can cancel event and it leaves the public site',
      cancelled.data?.data?.event?.status === 'CANCELLED' && !(afterCancel.data?.data?.events || []).some((item) => item.slug === eventSlug),
      cancelled.data?.data?.event?.status || ''
    );

    const archived = await api(`/admin/events/${event?.id}`, { method: 'DELETE', token: admin.token });
    const afterArchive = await api(`/events/${eventSlug}`);
    record('Archived event is hidden', archived.data?.data?.event?.status === 'ARCHIVED' && afterArchive.status === 404, archived.data?.data?.event?.status || '');

    const badDates = await api('/admin/events', {
      method: 'POST',
      token: admin.token,
      body: eventBody({ slug: `en18-${stamp}-dates`, startDate: '2026-12-02', endDate: '2026-12-01' }),
    });
    record('Invalid event dates are rejected', badDates.status === 400, badDates.data?.code || String(badDates.status));

    const firstDuplicate = await api('/admin/events', { method: 'POST', token: admin.token, body: eventBody({ slug: duplicateSlug, title: `Duplicate one ${stamp}` }) });
    const secondDuplicate = await api('/admin/events', { method: 'POST', token: admin.token, body: eventBody({ slug: duplicateSlug, title: `Duplicate two ${stamp}` }) });
    record('Duplicate slug is rejected', firstDuplicate.status === 201 && secondDuplicate.status === 409 && secondDuplicate.data?.code === 'DUPLICATE_DATA', secondDuplicate.data?.code || String(secondDuplicate.status));

    const spoofed = await api('/admin/events', {
      method: 'POST',
      token: admin.token,
      body: eventBody({ slug: `en18-${stamp}-spoof`, createdBy: customer.user?.id, isPublished: true }),
    });
    record('Client cannot set createdBy or publication flags', spoofed.status === 400, spoofed.data?.code || String(spoofed.status));

    const badImage = await api('/admin/events', {
      method: 'POST',
      token: admin.token,
      body: eventBody({ slug: `en18-${stamp}-image`, imageUrl: 'javascript:alert(1)' }),
    });
    record('Invalid image URL is rejected', badImage.status === 400, badImage.data?.code || String(badImage.status));

    const news = await api('/admin/news', {
      method: 'POST',
      token: admin.token,
      body: {
        title: `Harvest note ${stamp}`,
        slug: newsSlug,
        excerpt: 'The valley is ready for the first pour.',
        content: 'The first pour of the season is announced from Aramaio.',
      },
    });
    const article = news.data?.data?.article;
    const staffNews = await api('/admin/news', { method: 'POST', token: staff.token, body: { title: 'Staff news', excerpt: 'Nope', content: 'Nope' } });
    record('Admin can create news', news.status === 201 && article?.status === 'DRAFT' && article?.createdBy === admin.user?.id, article?.status || String(news.status));
    record('Staff cannot create news', staffNews.status === 403, String(staffNews.status));

    const hiddenNews = await api('/news');
    const hiddenNewsSlug = await api(`/news/${newsSlug}`);
    record('Draft news is hidden', !(hiddenNews.data?.data?.articles || []).some((item) => item.slug === newsSlug) && hiddenNewsSlug.status === 404, String(hiddenNewsSlug.status));

    const publishedNews = await api(`/admin/news/${article?.id}`, { method: 'PATCH', token: admin.token, body: { status: 'PUBLISHED' } });
    const publicNews = await api('/news');
    const visibleArticle = (publicNews.data?.data?.articles || []).find((item) => item.slug === newsSlug);
    record('Published news appears publicly', publishedNews.status === 200 && visibleArticle?.excerpt && !('createdBy' in visibleArticle), publishedNews.data?.data?.article?.status || '');

    const updatedNews = await api(`/admin/news/${article?.id}`, { method: 'PATCH', token: admin.token, body: { title: `Updated note ${stamp}` } });
    record('Admin can update news', updatedNews.status === 200 && updatedNews.data?.data?.article?.title === `Updated note ${stamp}`, String(updatedNews.status));

    const archivedNews = await api(`/admin/news/${article?.id}`, { method: 'DELETE', token: admin.token });
    const afterNewsArchive = await api(`/news/${newsSlug}`);
    record('Archived news is hidden', archivedNews.data?.data?.article?.status === 'ARCHIVED' && afterNewsArchive.status === 404, archivedNews.data?.data?.article?.status || '');

    const customerEventWrite = await api(`/admin/events/${event?.id}`, { method: 'PATCH', token: customer.token, body: { status: 'PUBLISHED' } });
    const customerNewsWrite = await api(`/admin/news/${article?.id}`, { method: 'DELETE', token: customer.token });
    record('Customer cannot manage events or news', customerEventWrite.status === 403 && customerNewsWrite.status === 403, `${customerEventWrite.status}/${customerNewsWrite.status}`);
  } finally {
    await cleanup();
    await mongoose.connection.db.collection('users').deleteMany({ email: `en18-${stamp}@example.com` });
    closeRealtime();
    await new Promise((resolve) => server.close(resolve));
    await disconnectDB();
  }

  const failed = results.filter((item) => !item.pass);
  console.log(`\n${results.length - failed.length}/${results.length} events and news checks passed`);
  if (failed.length) process.exitCode = 1;
}

main().catch(async (error) => {
  console.error('Events and news check aborted:', error);
  try {
    await cleanup();
  } catch (cleanupError) {
    console.error('Cleanup failed:', cleanupError.message);
  }
  process.exit(1);
});
