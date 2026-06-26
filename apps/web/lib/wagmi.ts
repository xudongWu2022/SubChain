import { http, createConfig, injected } from "wagmi";
import { foundry } from "wagmi/chains";

export const config = createConfig({
  chains: [foundry],
  connectors: [injected()],
  transports: {
    [foundry.id]: http(process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545")
  },
  ssr: true
});
