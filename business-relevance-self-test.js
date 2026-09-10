const assert = require('node:assert/strict');
const { buildBusinessFactSources, checkBusinessRelevance,
  buildOwnerVoiceStyleProfile, formatOwnerVoiceStyleProfileForPrompt } = require('./server');

const sample = 'Time is a strange one because most days don’t feel particularly important while you’re living them. You go to work, come home, do what needs doing and carry on. Then you look back a few years later and realise that was your life happening the whole time lol. Makes you think a bit differently about what deserves your attention now instead of always waiting for later.';
const description = 'Timeless Treasures Gifts and Decor is a family owned gift and home decor shop in Picton, established in 1999.';
const laneGather = { pages: [{ title: 'Timeless Treasures Gifts and Decor', metaDescription: description }], lanes: {} };
const facts = buildBusinessFactSources({ laneGather, ownerWritingSample: sample });
assert.ok(facts.productText.includes(description), 'Metadata must survive empty classified lanes');
assert.ok(!Object.values(facts).join(' ').includes('Time is a strange'), 'Sample must not enter facts');
assert.deepEqual(buildBusinessFactSources({ ownerWritingSample: sample }), { founderText: '', customerText: '', productText: '' }, 'Failed scan cannot fall back to voice');
assert.deepEqual(buildBusinessFactSources({ ownerWritingSample: 'We sell plumbing services to customers.' }), { founderText: '', customerText: '', productText: '' }, 'Business keywords in voice must not bypass source roles');
assert.ok(buildBusinessFactSources({ manualBusinessContext: description }).productText.includes(description));
const style = formatOwnerVoiceStyleProfileForPrompt(buildOwnerVoiceStyleProfile(sample));
assert.ok(!style.includes('Time is a strange') && !style.includes('you go to work'), 'Raw sample topics must not be reintroduced through quarantined phrases');

(async () => {
  const profile = { businessProfile: { name: 'Timeless Treasures', summary: description }, sourceProfile: { productLanePreview: description } };
  const posts = ['Choose a gift for someone you know.', 'Find something for your home.', 'A gift does not need a big occasion.'];
  const verdict = { businessMatchesSource: true, posts: [0, 1, 2].map(index => ({ index, relevant: true })) };
  assert.equal((await checkBusinessRelevance(posts, profile, async prompt => {
    assert.ok(prompt.includes(description));
    assert.ok(!prompt.includes(sample));
    return verdict;
  })).failed, false);
  for (const invalid of [{}, { ...verdict, businessMatchesSource: false },
    { ...verdict, posts: verdict.posts.slice(0, 2) },
    { ...verdict, posts: [{ index: 0, relevant: true }, { index: 0, relevant: true }, { index: 2, relevant: true }] },
    { ...verdict, posts: verdict.posts.map(p => ({ ...p, relevant: p.index !== 1 })) },
    { ...verdict, posts: verdict.posts.map(p => ({ ...p, relevant: 'true' })) }]) {
    assert.equal((await checkBusinessRelevance(posts, profile, async () => invalid)).failed, true);
  }
  assert.equal((await checkBusinessRelevance(posts, {}, async () => { throw Error('Must not call model without evidence'); })).failed, true);
  await assert.rejects(checkBusinessRelevance(posts, profile, async () => { throw Error('Reviewer unavailable'); }));
  console.log('Business relevance tests passed: source separation, metadata recovery, missing evidence, strict per-post verdicts, reviewer failure.');
})().catch(error => { console.error(error); process.exitCode = 1; });
