import type { StaticImageData } from "next/image"
import solana from "./icons/solana.svg"
import ethereum from "./icons/eth.svg"
import tron from "./icons/trx.svg"
import bsc from "./icons/bsc.svg"
import arbitrum from "./icons/arbitrum.svg"
import optimism from "./icons/optimism.svg"
import polygon from "./icons/polygon.svg"
import gram from "./icons/gram.svg"
import btc from "./icons/btc.svg"
import doge from "./icons/doge.svg"
import xrp from "./icons/xrp.svg"

// networkIcons.ts
export const NETWORK_ICONS: Record<string, StaticImageData> = {
  SOL: solana,
  ERC20: ethereum,
  TRC20: tron,
  BSC: bsc,
  ARB: arbitrum,
  OP: optimism,
  MATIC: polygon,
  TON: gram, // shown as GRAM; "TON" stays the gateway id
  BTC: btc,
  DOGE: doge,
  XRP: xrp,
}
