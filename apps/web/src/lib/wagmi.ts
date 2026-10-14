import { http, createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { arcTestnet, arcMainnet } from "./arc-chains";

export const wagmiConfig = createConfig({
  chains: [arcTestnet, arcMainnet],
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: http("https://rpc.testnet.arc.io"),
    [arcMainnet.id]: http("https://rpc.mainnet.arc.io"),
  },
  ssr: true,
});
