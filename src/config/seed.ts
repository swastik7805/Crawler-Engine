/**
 * Curated seed sources for The Chronicle's Web3 domain corpus.
 * Priority tiers:
 *   1 — Canonical references (EIPs, official docs)
 *   2 — High-signal security research and audit blogs
 *   3 — Community content, newsletters, forums
 */

export interface SeedSource {
  url: string;
  domain: string;
  /**
   * 1 = highest priority (official docs, EIPs)
   * 5 = default
   * 10 = lowest (community forums)
   */
  priority: number;
  /**
   * Max link-follow depth from the root URL.
   * Deeper = more pages indexed, slower crawl.
   */
  crawlDepth: number;
  category: 'standards' | 'documentation' | 'security' | 'cryptography' | 'community' | 'web3';
}

export const SEED_SOURCES: SeedSource[] = [
  // Standards and official Documentation
  {
    url: 'https://eips.ethereum.org',
    domain: 'eips.ethereum.org',
    priority: 1,
    crawlDepth: 3,
    category: 'standards',
  },
  {
    url: 'https://ethereum.github.io/yellowpaper/paper.pdf',
    domain: 'ethereum.github.io',
    priority: 1,
    crawlDepth: 1,
    category: 'standards',
  },
  {
    url: 'https://ethereum.org/en/developers/docs',
    domain: 'ethereum.org',
    priority: 1,
    crawlDepth: 4,
    category: 'documentation',
  },

  // Solidity and Framework Docs
  {
    url: 'https://docs.soliditylang.org/en/latest',
    domain: 'docs.soliditylang.org',
    priority: 1,
    crawlDepth: 4,
    category: 'documentation',
  },
  {
    url: 'https://docs.vyperlang.org/en/stable',
    domain: 'docs.vyperlang.org',
    priority: 1,
    crawlDepth: 4,
    category: 'documentation',
  },
  {
    url: 'https://docs.openzeppelin.com/contracts',
    domain: 'docs.openzeppelin.com',
    priority: 1,
    crawlDepth: 4,
    category: 'documentation',
  },
  {
    url: 'https://hardhat.org/docs',
    domain: 'hardhat.org',
    priority: 2,
    crawlDepth: 3,
    category: 'documentation',
  },
  {
    url: 'https://book.getfoundry.sh',
    domain: 'book.getfoundry.sh',
    priority: 2,
    crawlDepth: 3,
    category: 'documentation',
  },

  // Smart Contracts and Ethereum Standards
  {
    url: 'https://swcregistry.io',
    domain: 'swcregistry.io',
    priority: 2,
    crawlDepth: 3,
    category: 'security',
  },
  {
    url: 'https://blog.openzeppelin.com',
    domain: 'blog.openzeppelin.com',
    priority: 2,
    crawlDepth: 2,
    category: 'security',
  },
  {
    url: 'https://blog.trailofbits.com',
    domain: 'blog.trailofbits.com',
    priority: 2,
    crawlDepth: 2,
    category: 'security',
  },
  {
    url: 'https://rekt.news',
    domain: 'rekt.news',
    priority: 2,
    crawlDepth: 2,
    category: 'security',
  },
  {
    url: 'https://consensys.io/diligence/blog',
    domain: 'consensys.io',
    priority: 2,
    crawlDepth: 2,
    category: 'security',
  },
  {
    url: 'https://www.zellic.io/blog',
    domain: 'zellic.io',
    priority: 2,
    crawlDepth: 2,
    category: 'security',
  },
  {
    url: 'https://github.com/crytic/not-so-smart-contracts',
    domain: 'github.com',
    priority: 2,
    crawlDepth: 2,
    category: 'security',
  },
  
  // Cryptography and Zero-Knowledge
  {
    url: 'https://www.zkdocs.com',
    domain: 'zkdocs.com',
    priority: 2,
    crawlDepth: 3,
    category: 'cryptography',
  },
  {
    url: 'https://docs.circom.io',
    domain: 'docs.circom.io',
    priority: 2,
    crawlDepth: 3,
    category: 'cryptography',
  },
  {
    url: 'https://docs.gnark.consensys.io',
    domain: 'docs.gnark.consensys.io',
    priority: 2,
    crawlDepth: 3,
    category: 'cryptography',
  },
  {
    url: 'https://z.cash/technology/zksnarks',
    domain: 'z.cash',
    priority: 2,
    crawlDepth: 2,
    category: 'cryptography',
  },

  // Community and Research
  {
    url: 'https://ethereum-magicians.org',
    domain: 'ethereum-magicians.org',
    priority: 3,
    crawlDepth: 2,
    category: 'community',
  },
  {
    url: 'https://ethresear.ch',
    domain: 'ethresear.ch',
    priority: 3,
    crawlDepth: 2,
    category: 'community',
  },
  {
    url: 'https://noxx.substack.com',
    domain: 'noxx.substack.com',
    priority: 3,
    crawlDepth: 2,
    category: 'community',
  },
];