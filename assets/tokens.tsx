import type { StaticImageData } from "next/image"
import usdc from "./icons/usdc.svg"
import usdt from "./icons/usdt.svg"
import eth from "./icons/eth.svg"
import btc from "./icons/btc.svg"
import doge from "./icons/doge.svg"
import xrp from "./icons/xrp.svg"
import gram from "./icons/gram.svg"
import bsc from "./icons/bsc.svg"

export const TOKENS: {
  fullname: string
  icon: StaticImageData
  min_amount: number
  max_amount: number
  currency: string
  network: string
}[] = [
  {
    min_amount: 0.000112,
    max_amount: 1.90001478,
    currency: "BTC",
    network: "BTC",
    fullname: "btc",
    icon: btc,
  },
  {
    min_amount: 10.008116,
    max_amount: 170424.38799,
    currency: "USDT",
    network: "ERC20",
    fullname: "usdterc20",
    icon: usdt,
  },
  {
    min_amount: 0.0031662,
    max_amount: 56.05348725024579,
    currency: "ETH",
    network: "ERC20",
    fullname: "eth",
    icon: eth,
  },
  {
    min_amount: 10.0204975,
    max_amount: 170475.539135,
    currency: "USDC",
    network: "ERC20",
    fullname: "usdc",
    icon: usdc,
  },
  {
    min_amount: 9.5694145,
    max_amount: 127856.38183291924,
    currency: "USDC",
    network: "BSC",
    fullname: "usdcbsc",
    icon: usdc,
  },
  {
    min_amount: 9.5694145,
    max_amount: 127856.38183291924,
    currency: "BNB",
    network: "BSC",
    fullname: "bnbbsc",
    icon: bsc,
  },
  {
    min_amount: 9.5623834,
    max_amount: 170423.98470989926,
    currency: "USDT",
    network: "BSC",
    fullname: "usdtbsc",
    icon: usdt,
  },

  {
    min_amount: 9.6234453,
    max_amount: 85199.369071,
    currency: "USDT",
    network: "TON",
    fullname: "usdtton",
    icon: usdt,
  },
  {
    min_amount: 9.6234453,
    max_amount: 85199.369071,
    currency: "GRAM",
    network: "TON",
    fullname: "ton",
    icon: gram,
  },
  {
    min_amount: 14.3852488,
    max_amount: 170428.348253,
    currency: "USDT",
    network: "TRC20",
    fullname: "usdttrc20",
    icon: usdt,
  },

  {
    min_amount: 9.6212308,
    max_amount: 170475.177894,
    currency: "USDC",
    network: "ARB",
    fullname: "usdcarb",
    icon: usdc,
  },
  {
    min_amount: 11.4841241,
    max_amount: 2557.84594,
    currency: "USDT",
    network: "OP",
    fullname: "usdtop",
    icon: usdt,
  },

  {
    min_amount: 10.0216736,
    max_amount: 8524.293313,
    currency: "USDC",
    network: "OP",
    fullname: "usdcop",
    icon: usdc,
  },
  {
    min_amount: 7.0097506,
    max_amount: 63546.899384,
    currency: "XRP",
    network: "XRP",
    fullname: "xrp",
    icon: xrp,
  },
  {
    min_amount: 9.5132321,
    max_amount: 85237.58182,
    currency: "USDC",
    network: "MATIC",
    fullname: "usdcmatic",
    icon: usdc,
  },

  {
    min_amount: 9.5103813,
    max_amount: 102254.395971,
    currency: "USDT",
    network: "MATIC",
    fullname: "usdtmatic",
    icon: usdt,
  },

  {
    min_amount: 73.6371884,
    max_amount: 304087.73610796,
    currency: "DOGE",
    network: "DOGE",
    fullname: "doge",
    icon: doge,
  },

  {
    min_amount: 9.6168912,
    max_amount: 20695.062401,
    currency: "USDT",
    network: "ARB",
    fullname: "usdtarb",
    icon: usdt,
  },
]
