// One-off migration: assign region + category to existing pinned articles.
// Run with: heroku run node migrate-curation.js
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
});

// [title_substring, region, category]
// Note: some titles use curly apostrophes/quotes — substrings avoid them.
const ASSIGNMENTS = [
  ['Paul Ehrlich',                                               'global',   'Science'],
  ['California approves rules for landmark corporate climate',   'americas', 'Policy'],
  ['Climate change is the latest weapon in warfare',             'global',   'Policy'],
  ['Trump Administration Forces Washington',                     'americas', 'Policy'],
  ['How Electric Cars Cut Oil Dependence',                       'global',   'General'],
  ["Fossil fuels? No thanks. Why Trump's Iran war is pushing EU",'europe',   'Policy'],
  ['Ecuador: Government Defies Court-Ordered Oil Ban',           'americas', 'Policy'],
  ['Gulf investors seen likely to keep funding Africa renewable', 'africa',   'Environment'],
  ['Fossil Fuel Reliance Is Ripping Away Nations',               'global',   'Policy'],
  ['Iran War Should Trigger Faster Exit From Fossil Fuel',       'mena',     'Policy'],
  ['Sea levels around Africa are rising faster',                 'africa',   'Environment'],
  ['Beyond the Potomac River',                                   'americas', 'Environment'],
  ["NY's climate law clashes with Gov. Hochul",                  'americas', 'Policy'],
  ['feds pulled $1.5B from tribal clean energy',                 'americas', 'Community'],
  ['Fossil Fuels as a Weapon of War',                            'mena',     'Policy'],
  ['Electric grid faces political roadblocks',                   'americas', 'Policy'],
  ['Africa Is Reimagining Climate Finance',                      'africa',   'Policy'],
  ["acid rain' in the wake of US bombings in Iran",              'mena',     'Science'],
  ["China's Fossil Fuel Emissions Dropped",                      'asia',     'Science'],
  ['Türkiye acts to align universities with COP31',              'europe',   'Policy'],
  ['Enbridge paid police to protect one pipeline',               'americas', 'Community'],
  ['The last 3 years were the hottest ever recorded',            'global',   'Science'],
  ['Rampant growth of satellite mega constellations',            'global',   'General'],
  ['Earth is now heating up twice as fast',                      'global',   'Science'],
  ['New Report Warns Trump EPA Undermining Health',              'americas', 'Policy'],
  ['Elon Musk Keeps Adding Deafening Turbines',                  'americas', 'General'],
  ['Sea levels around the world are much higher than we thought','global',   'Science'],
  ['The Iran War Is Also a Climate War',                         'mena',     'Policy'],
  ["Trump's War With Iran Is Also a Climate War",                'mena',     'Policy'],
  ['Louisiana becomes flash point in battle over carbon',        'americas', 'Policy'],
  ["Ontario's solar boom and bust put more solar in Africa",     'africa',   'Environment'],
  ["EPA's Endangerment Finding Repeal",                          'americas', 'Policy'],
  ['How Columbia Students and Local Activists',                  'americas', 'Community'],
  ['climate-smart villages are building rural resilience in India','asia',   'Community'],
  ['lead leakage monitoring in perovskite solar',                'global',   'Science'],
  ['How Can AI Address Climate Justice When Women',              'global',   'Community'],
  ['What immigration crackdowns have to do with climate',        'americas', 'Policy'],
  ['continue the fight for environmental justice in Black',      'americas', 'Community'],
  ["Elon Musk's makeshift AI power plant generates sound",       'americas', 'General'],
  ['Solar power is taking off in Malawi',                        'africa',   'Environment'],
  ['Proximity to nuclear power plants associated with increased cancer','global','Science'],
  ['Countries in the Americas can act to protect the environment','americas','Policy'],
  ['Planning Exercises That Got Community Engagement Right',     'global',   'Community'],
  ['Renewables Top 25% of U.S. Power',                          'americas', 'Policy'],
  ['We need a global assessment of avoidable climate-change risks','global', 'Policy'],
  ['intersectional water justice toolkit',                       'africa',   'Community'],
  ['FBI Counterterrorism Agents Spent Weeks Seeking a Climate Activist','americas','Community'],
  ["Six possible effects of Trump's climate policy change",      'americas', 'Policy'],
  ["AI can't cure the climate crisis",                           'global',   'Science'],
  ["Jesse Jackson's vision for America embraced environmental justice",'americas','Community'],
  ["Thermal drone footage shows Musk's AI power plant",          'americas', 'Policy'],
  ["South Africa's carbon tax should stay",                      'africa',   'Policy'],
  ["Wall Street's Oil Deals Have Climate Activists",             'global',   'Policy'],
  ['Europe Must Not Abandon Its Climate Ambitions',              'europe',   'Policy'],
  ['Supreme Court takes up oil companies',                       'americas', 'Policy'],
  ['UN Secretary General: Clean Energy Future Is within Reach',  'global',   'Policy'],
  ['The Important Role That Black Communities Play',             'americas', 'Community'],
  // Curly-apostrophe titles — matched via apostrophe-free substrings
  ['pushing EU toward renewables',                               'europe',   'Policy'],
  ['climate law clashes with Gov. Hochul',                       'americas', 'Policy'],
  ['acid rain',                                                  'mena',     'Science'],
  ['War With Iran Is Also a Climate War',                        'mena',     'Policy'],
  ['Endangerment Finding Repeal Stands',                         'americas', 'Policy'],
  ['vision for America embraced environmental justice',          'americas', 'Community'],
  ['Thermal drone footage shows Musk',                           'americas', 'Policy'],
  ['carbon tax should stay',                                     'africa',   'Policy'],
  ['Oil Deals Have Climate Activists',                           'global',   'Policy'],
];

async function run() {
  const { rows } = await pool.query('SELECT pinned FROM curation WHERE id = 1');
  let pinned = rows[0].pinned;
  let updated = 0;

  pinned = pinned.map(p => {
    const match = ASSIGNMENTS.find(([substr]) => p.title?.includes(substr));
    if (match) {
      updated++;
      return { ...p, region: match[1], category: match[2] };
    }
    return p;
  });

  await pool.query('UPDATE curation SET pinned = $1 WHERE id = 1', [JSON.stringify(pinned)]);
  console.log(`\nUpdated ${updated} / ${pinned.length} articles.\n`);

  const unmatched = pinned.filter(p => !ASSIGNMENTS.find(([s]) => p.title?.includes(s)));
  if (unmatched.length) {
    console.log('⚠ Unmatched (still global):');
    unmatched.forEach(p => console.log(' -', p.title?.slice(0, 80)));
  } else {
    console.log('All articles matched and updated.');
  }

  await pool.end();
}

run().catch(err => { console.error(err); process.exit(1); });
