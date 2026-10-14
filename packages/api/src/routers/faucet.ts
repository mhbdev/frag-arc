import { publicProcedure, router } from "../index";

export const DEMO_NFTS = [
  {
    id: 1,
    name: "ArcGenesis #001: Cyber Sentinel",
    symbol: "ARCSEN",
    description: "First-generation neural sentinel guarding the Arc Layer 1 core validators.",
    image: "https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?auto=format&fit=crop&w=800&q=80",
    attributes: [
      { trait_type: "Class", value: "Guardian" },
      { trait_type: "Rarity", value: "Legendary" },
      { trait_type: "Power Core", value: "USDC Hyperdrive" },
      { trait_type: "Network", value: "Arc Mainnet" },
    ],
  },
  {
    id: 2,
    name: "ArcGenesis #002: Quantum Chrono",
    symbol: "ARCQTM",
    description: "An artifact harnessing deterministic sub-second finality across multichain bridges.",
    image: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80",
    attributes: [
      { trait_type: "Class", value: "Chronos" },
      { trait_type: "Rarity", value: "Epic" },
      { trait_type: "Finality", value: "<1 Second" },
      { trait_type: "Network", value: "Arc" },
    ],
  },
  {
    id: 3,
    name: "ArcGenesis #003: Neon Valkyrie",
    symbol: "ARCVALK",
    description: "Cybernetic warrior navigating the decentralized liquidity pools of Osaka EVM.",
    image: "https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?auto=format&fit=crop&w=800&q=80",
    attributes: [
      { trait_type: "Class", value: "Valkyrie" },
      { trait_type: "Rarity", value: "Mythic" },
      { trait_type: "Weapon", value: "Plasma Katana" },
      { trait_type: "Network", value: "Arc" },
    ],
  },
  {
    id: 4,
    name: "ArcGenesis #004: Holographic Prism",
    symbol: "ARCPRSM",
    description: "Spectral prism encoding bidirectional fractional vault states with native 18-decimal precision.",
    image: "https://images.unsplash.com/photo-1633167606207-d840b5070fc2?auto=format&fit=crop&w=800&q=80",
    attributes: [
      { trait_type: "Class", value: "Artifact" },
      { trait_type: "Rarity", value: "Rare" },
      { trait_type: "Interface", value: "Bidirectional" },
      { trait_type: "Network", value: "Arc" },
    ],
  },
];

export const faucetRouter = router({
  getPresets: publicProcedure.query(() => {
    return DEMO_NFTS;
  }),
});
