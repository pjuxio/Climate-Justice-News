'use strict';

const rawArticle = {
  title: 'Climate Policy Advances in EU',
  source: { name: 'Reuters' },
  author: 'Jane Smith',
  description: 'The EU passed landmark climate legislation.',
  url: 'https://reuters.com/climate/policy-2025',
  urlToImage: 'https://reuters.com/img/climate.jpg',
  publishedAt: '2025-03-15T12:00:00Z',
  content: 'Full article text here about climate policy changes in the European Union.',
};

const pinnedArticle = {
  url: 'https://example.com/pinned',
  title: 'A Pinned Story',
  source: 'The Guardian',
  author: null,
  description: 'Important climate justice story.',
  image: null,
  publishedAt: '2025-03-10T08:00:00Z',
  readTime: 3,
  category: 'Policy',
  note: 'Must read',
  region: 'global',
  pinnedAt: '2025-03-10T09:00:00Z',
};

const manualArticle = {
  url: 'https://example.com/manual',
  title: 'A Manual Story',
  source: 'BBC News',
  author: 'Bob Jones',
  description: 'A manually added climate article.',
  image: 'https://bbc.co.uk/img/story.jpg',
  publishedAt: '2025-03-12T10:00:00Z',
  readTime: 2,
  category: 'Environment',
  region: 'europe',
  addedAt: '2025-03-12T11:00:00Z',
};

/** A valid article body for POST /api/curation/pin */
const pinBody = {
  url: 'https://theguardian.com/environment/2025/article',
  title: 'Guardian Climate Story',
  source: 'The Guardian',
  author: 'Alice Green',
  description: 'A detailed look at climate justice.',
  image: 'https://theguardian.com/img/climate.jpg',
  publishedAt: '2025-03-01T09:00:00Z',
  readTime: 4,
  category: 'Policy',
  note: 'High priority',
  region: 'global',
};

/** A valid article body for POST /api/curation/manual */
const manualBody = {
  url: 'https://nytimes.com/2025/climate-article',
  title: 'NYT Climate Coverage',
  source: 'New York Times',
  author: 'Bob Reporter',
  description: 'New York Times coverage of climate events.',
  image: null,
  publishedAt: '2025-03-05T08:00:00Z',
  readTime: 3,
  category: 'Environment',
  region: 'americas',
};

module.exports = { rawArticle, pinnedArticle, manualArticle, pinBody, manualBody };
