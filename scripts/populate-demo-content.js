/**
 * Populate demo Events and News using the existing Admin API.
 * Idempotent: Updates if existing by slug, creates if not.
 * Only uses valid HTTPS URLs and valid schema fields.
 */
const http = require('http');
const app = require('../src/app');
const { connectDB, disconnectDB } = require('../src/config/db');
const { initializeRealtime, closeRealtime } = require('../src/services/realtime.service');

const PORT = 5096;
const BASE = `http://127.0.0.1:${PORT}/api/v1`;

const DEMO_EVENTS = [
  {
    title: 'Basque Gastronomy Evening: Chuletón & Kupela',
    slug: 'basque-gastronomy-evening',
    shortDescription: 'Prime dry-aged Basque txuleta grilled over apple-wood coals, paired with fresh kupela cider pours.',
    description: 'Join us at Sidrería Iturrieta for an intimate celebration of Basque fire and fruit. Our grill masters prepare dry-aged chuletón steaks over red-hot apple-wood charcoal from our own orchard prunings, seasoned exclusively with coarse sea salt from Añana.\n\nThroughout the evening, the traditional cry of "Txotx!" will echo through the cellar, inviting guests to step directly to the ancient chestnut barrels and catch the streaming natural cider at its peak effervescence. The dinner includes warm farmhouse bread, Basque cod with sweet piquillo peppers, and roasted apples with farmhouse cream.',
    location: 'Sidrería Iturrieta, Kupela Dining Room, Aramaio',
    startDate: '2026-11-20',
    endDate: '2026-11-20',
    startTime: '20:00',
    endTime: '23:30',
    status: 'PUBLISHED',
    imageUrl: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=1200&auto=format&fit=crop&q=80',
  },
  {
    title: 'Txotx & Cider Barrel Opening Experience',
    slug: 'txotx-cider-barrel-opening',
    shortDescription: 'Experience the ancestral ritual of opening the new vintage barrels with our master cider maker in Aramaio.',
    description: 'Step into the atmospheric kupela cellar of Iturrieta where centuries of Basque cidermaking come alive. This special midday gathering begins with an orchard stroll beneath our 1,400 heritage apple trees, followed by an in-depth cellar tasting where you will sample cider from five distinct wooden vats.\n\nLearn the art of angling your glass to aerate the cider, unlocking crisp aromas of wild green apples and limestone minerality. Each pour is accompanied by traditional sagardotegi pintxos including salt-cod omelette, artisan chorizo simmered in fresh cider, and Idiazabal cheese with quince paste.',
    location: 'Sidrería Iturrieta, Cellar & Orchard, Aramaio',
    startDate: '2026-11-27',
    endDate: '2026-11-27',
    startTime: '13:00',
    endTime: '16:30',
    status: 'PUBLISHED',
    imageUrl: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=1200&auto=format&fit=crop&q=80',
  },
  {
    title: 'Sagardo Eguna: Aramaio Valley Cider Festival',
    slug: 'sagardo-eguna-cider-festival',
    shortDescription: 'Our annual valley cider festival with apple pressing demonstrations, artisanal markets, and folk music.',
    description: 'Sagardo Eguna (Cider Day) is the high point of autumn in Aramaio. For this special weekend festival, Sidrería Iturrieta throws open its courtyard and grounds to celebrate the fruit of the harvest.\n\nWitness live pressing demonstrations on our historic wooden press, taste freshly pressed sweet must (mostoa) before fermentation, and enjoy live performances by Basque accordionists (trikitilariak). Regional artisans will present raw milk sheep cheeses, wild honey, and stone-ground talo corn flatbreads roasted over griddles.',
    location: 'Sidrería Iturrieta, Valley Grounds & Courtyard, Aramaio',
    startDate: '2026-12-05',
    endDate: '2026-12-06',
    startTime: '12:00',
    endTime: '19:00',
    status: 'PUBLISHED',
    imageUrl: 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=1200&auto=format&fit=crop&q=80',
  },
  {
    title: 'Traditional Basque Charcoal Grill Night',
    slug: 'traditional-basque-charcoal-grill',
    shortDescription: 'A rustic feast highlighting whole fish roasted in traditional wire baskets and charcoal-roasted seasonal vegetables.',
    description: 'On Friday evenings, the charcoal fire at Iturrieta burns late. This gathering honors the coastal and mountain crossroads of Basque cooking. Fresh sea bream and hake are grilled over glowing embers in traditional wire besuguera baskets, dressed only with garlic, chili, and our own aged cider vinegar.\n\nAccompanied by roasted leeks with romesco, wood-fired talo flatbreads, and unlimited pours from our oak kupelas. A celebration of pure ingredients and rustic Basque warmth.',
    location: 'Sidrería Iturrieta, Main Grill Hall, Aramaio',
    startDate: '2026-12-12',
    endDate: '2026-12-12',
    startTime: '20:00',
    endTime: '23:00',
    status: 'PUBLISHED',
    imageUrl: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1200&auto=format&fit=crop&q=80',
  },
  {
    title: 'Weekend Cider, Cheese & Trikitixa Folk Music',
    slug: 'weekend-cider-cheese-and-trikitixa',
    shortDescription: 'Sunday afternoon gatherings with live trikitixa accordion music, artisan Idiazabal cheeses, and family dining.',
    description: 'Sundays at Iturrieta are unhurried, warm, and communal. Gather around our long communal wooden tables as local folk musicians fill the dining hall with the energetic melodies of the trikitixa accordion and pandero.\n\nEnjoy our curated cheese board showcasing aged raw-milk Idiazabal cheeses from nearby shepherd huts, paired with walnuts, apple jelly, and natural cider. An authentic family experience where children, elders, and travelers gather together.',
    location: 'Sidrería Iturrieta, Long Table Dining Room, Aramaio',
    startDate: '2026-12-19',
    endDate: '2026-12-19',
    startTime: '13:30',
    endTime: '17:00',
    status: 'PUBLISHED',
    imageUrl: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1200&auto=format&fit=crop&q=80',
  },
];

const DEMO_NEWS = [
  {
    title: 'The 2026 Txotx Season Begins at Iturrieta',
    slug: 'the-2026-txotx-season-begins',
    excerpt: 'The autumn harvest has fermented to perfection in our wooden kupelas. Here is what to expect from the new vintage in Aramaio.',
    content: 'Every year as the winter chill settles into the green hills of Aramaio, our cellar master inspects the enormous wooden vats lining the kupela hall. The wild yeasts that inhabit our orchard have completed their silent alchemy, transforming sweet pressed apple must into dry, crisp, and refreshing Basque natural cider (sagardoa).\n\nThis season promises exceptional brightness. The sunny, dry September concentrated natural fruit sugars in our Errezila and Geza Miña apples, while cool mountain nights preserved their vibrant natural acidity. When the cider strikes the glass at a 45-degree angle, it breaks into a delicate white crown of natural effervescence (txinparta) that quickly dissipates, releasing aromas of green apple, wet stone, and meadow grass.\n\nWe invite our guests to join us around the long wooden tables, raise their glasses to the ceiling, and shout "Txotx!" as the stream pours forth.',
    status: 'PUBLISHED',
    imageUrl: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=1200&auto=format&fit=crop&q=80',
  },
  {
    title: 'Centuries of Basque Cider Tradition in the Aramaio Valley',
    slug: 'centuries-of-basque-cider-tradition',
    excerpt: 'How our family preserved ancient indigenous apple varietals and ancestral fermentation methods in the shadow of Mount Anboto.',
    content: 'Long before wine became widespread in the northern valleys of Euskal Herria, cider was the lifeblood of the Basque people. Basque sailors who navigated the stormy Atlantic toward Newfoundland in the sixteenth century stocked their galleons with barrels of sagardoa, protecting crews from scurvy thanks to its natural vitamin content.\n\nIn our family orchard in Aramaio, some of the apple trees trace their lineages back generations. Unlike industrial cider production which blends concentrate and artificial carbonation, authentic Basque cider requires only three elements: clean fruit, wooden casks, and patience.\n\nNo sulfites are added, no sweeteners are permitted, and no commercial yeasts are introduced. The result is an unfiltered, living beverage that mirrors the soil, rainfall, and morning mist of the valley.',
    status: 'PUBLISHED',
    imageUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1200&auto=format&fit=crop&q=80',
  },
  {
    title: 'From Orchard to Kupela: The Iturrieta Craft',
    slug: 'from-orchard-to-kupela-the-iturrieta-craft',
    excerpt: 'A behind-the-scenes look at hand-harvesting, wooden pressing, and slow cellar fermentation in our rustic family sagardotegia.',
    content: 'The journey of every bottle and barrel begins each October when the orchard grass is dewy and cold. Harvesting at Iturrieta is performed by hand using traditional wooden gathering tools known as kizkia—small wooden sticks with a nail that gently hook each fallen apple without bruising the delicate flesh.\n\nOnce gathered, the apples are washed in natural spring water, crushed in our mill, and pressed slowly between heavy wooden beams. The resulting must flows into underground settling tanks before being pumped into large chestnut and oak kupelas where fermentation begins spontaneously.\n\nFor nearly four months, the cellar remains quiet. The cider develops its characteristic balance of astringency, bitterness, and fruitiness until the first barrel is tapped in mid-winter.',
    status: 'PUBLISHED',
    imageUrl: 'https://images.unsplash.com/photo-1464349095431-e9a21285b5f3?w=1200&auto=format&fit=crop&q=80',
  },
  {
    title: 'Autumn Menu Highlights: Wood-Fired Chuletón & Local Cod',
    slug: 'autumn-menu-highlights-chuleton-and-cod',
    excerpt: 'Discover our traditional sagardotegi menu pairings, featuring pasture-raised Basque beef and salt-cured cod with cider-glazed onions.',
    content: 'The traditional Basque cider house menu has remained virtually unchanged for over a century, and for good reason: each course is calibrated to complement the acidity and tannin structure of freshly poured cider.\n\nOur autumn menu opens with a classic salt-cod omelette (bakailao tortilla), cooked with translucent eggs, sweet white onions, and green peppers so that the center remains juicy and molten. Next arrives fried cod fillets crowned with roasted Gernika peppers and fried garlic chips.\n\nThe centerpiece of the meal is the chuletón—a thick rib steak from grass-fed older dairy cattle, grilled over glowing charcoal to achieve a charred, salty crust and a warm, tender crimson core. To conclude, guests share wedges of smoked Idiazabal sheep cheese, crisp walnuts, and homemade apple jelly.',
    status: 'PUBLISHED',
    imageUrl: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=1200&auto=format&fit=crop&q=80',
  },
  {
    title: 'Behind the Scenes: Sustainable Farming in the Green Belt',
    slug: 'sustainable-farming-in-the-basque-green-belt',
    excerpt: 'Our commitment to zero-chemical organic orchards, wild bee sanctuaries, and solar energy in the heart of Álava.',
    content: 'Sustainability is not a modern marketing concept for us; it is the ancestral rhythm of living in harmony with the valley. Our 1,400 apple trees are certified organic and grown without synthetic pesticides, herbicides, or synthetic fertilizers.\n\nInstead, we rely on sheep to graze the orchard grass in spring and early summer, naturally controlling weeds while aerating the soil. We have installed twenty solitary bee and honeybee hives throughout the orchard perimeter, ensuring vigorous pollination when the trees burst into pale pink blossoms each May.\n\nAdditionally, all organic apple pomace left over after pressing is returned to the soil as compost or shared with neighboring dairy farmers as nutrient-rich livestock feed.',
    status: 'PUBLISHED',
    imageUrl: 'https://images.unsplash.com/photo-1541544741938-0af808871cc0?w=1200&auto=format&fit=crop&q=80',
  },
];

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

async function main() {
  await connectDB();
  const server = http.createServer(app);
  initializeRealtime(server);
  await new Promise((resolve, reject) => {
    server.listen(PORT, (error) => (error ? reject(error) : resolve()));
  });

  try {
    console.log('Logging in as admin...');
    const admin = await login('admin@iturrieta.eus', 'Admin12345!');
    if (!admin.token) throw new Error('Admin login failed');
    console.log(`Authenticated as ${admin.user?.name} (${admin.user?.email})`);

    // 1. Fetch current admin events to prevent duplicates
    const adminEventsRes = await api('/admin/events', { token: admin.token });
    const existingEvents = adminEventsRes.data?.data?.events || [];
    const eventBySlug = new Map(existingEvents.map((e) => [e.slug, e]));
    console.log(`Existing events in DB: ${existingEvents.length}`);

    let eventsCreated = 0;
    let eventsUpdated = 0;

    for (const eventInput of DEMO_EVENTS) {
      const existing = eventBySlug.get(eventInput.slug);
      if (existing) {
        console.log(`Updating existing event: ${eventInput.title} (${eventInput.slug})`);
        const updateRes = await api(`/admin/events/${existing.id}`, {
          method: 'PATCH',
          token: admin.token,
          body: {
            title: eventInput.title,
            description: eventInput.description,
            shortDescription: eventInput.shortDescription,
            location: eventInput.location,
            startDate: eventInput.startDate,
            endDate: eventInput.endDate,
            startTime: eventInput.startTime,
            endTime: eventInput.endTime,
            imageUrl: eventInput.imageUrl,
            status: 'PUBLISHED',
          },
        });
        if (updateRes.status !== 200) {
          console.error(`Failed to update event ${eventInput.slug}:`, updateRes.data);
        } else {
          eventsUpdated++;
        }
      } else {
        console.log(`Creating event: ${eventInput.title} (${eventInput.slug})`);
        const createRes = await api('/admin/events', {
          method: 'POST',
          token: admin.token,
          body: eventInput,
        });
        if (createRes.status !== 201) {
          console.error(`Failed to create event ${eventInput.slug}:`, createRes.data);
        } else {
          eventsCreated++;
        }
      }
    }

    // 2. Fetch current admin news to prevent duplicates
    const adminNewsRes = await api('/admin/news', { token: admin.token });
    const existingNews = adminNewsRes.data?.data?.articles || [];
    const newsBySlug = new Map(existingNews.map((n) => [n.slug, n]));
    console.log(`Existing news articles in DB: ${existingNews.length}`);

    let newsCreated = 0;
    let newsUpdated = 0;

    for (const newsInput of DEMO_NEWS) {
      const existing = newsBySlug.get(newsInput.slug);
      if (existing) {
        console.log(`Updating existing article: ${newsInput.title} (${newsInput.slug})`);
        const updateRes = await api(`/admin/news/${existing.id}`, {
          method: 'PATCH',
          token: admin.token,
          body: {
            title: newsInput.title,
            excerpt: newsInput.excerpt,
            content: newsInput.content,
            imageUrl: newsInput.imageUrl,
            status: 'PUBLISHED',
          },
        });
        if (updateRes.status !== 200) {
          console.error(`Failed to update article ${newsInput.slug}:`, updateRes.data);
        } else {
          newsUpdated++;
        }
      } else {
        console.log(`Creating article: ${newsInput.title} (${newsInput.slug})`);
        const createRes = await api('/admin/news', {
          method: 'POST',
          token: admin.token,
          body: newsInput,
        });
        if (createRes.status !== 201) {
          console.error(`Failed to create article ${newsInput.slug}:`, createRes.data);
        } else {
          newsCreated++;
        }
      }
    }

    console.log('\n--- POPULATION SUMMARY ---');
    console.log(`Events created: ${eventsCreated}, updated: ${eventsUpdated}`);
    console.log(`News articles created: ${newsCreated}, updated: ${newsUpdated}`);

    // 3. Verify Public APIs
    console.log('\n--- VERIFYING PUBLIC APIS ---');
    const publicEventsRes = await api('/events?scope=all');
    const publicEvents = publicEventsRes.data?.data?.events || [];
    console.log(`Public events returned: ${publicEvents.length}`);
    publicEvents.forEach((e) => console.log(`  - [${e.startDate} ${e.startTime}] ${e.title} (/events/${e.slug})`));

    const publicNewsRes = await api('/news');
    const publicArticles = publicNewsRes.data?.data?.articles || [];
    console.log(`Public news articles returned: ${publicArticles.length}`);
    publicArticles.forEach((a) => console.log(`  - [${a.publishedAt?.slice(0, 10)}] ${a.title} (/news/${a.slug})`));

    // Verify detail endpoints
    for (const e of DEMO_EVENTS) {
      const detail = await api(`/events/${e.slug}`);
      if (detail.status !== 200) {
        console.error(`Public event detail failed for ${e.slug} (status ${detail.status})`);
      }
    }
    for (const n of DEMO_NEWS) {
      const detail = await api(`/news/${n.slug}`);
      if (detail.status !== 200) {
        console.error(`Public news detail failed for ${n.slug} (status ${detail.status})`);
      }
    }

    console.log('\nALL DEMO CONTENT VERIFIED THROUGH PUBLIC APIS SUCCESSFULLY.');
  } finally {
    closeRealtime();
    await new Promise((resolve) => server.close(resolve));
    await disconnectDB();
  }
}

main().catch((err) => {
  console.error('Population script failed:', err);
  process.exit(1);
});
