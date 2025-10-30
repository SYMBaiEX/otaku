import type { Plugin } from "@elizaos/core";
import { DefiLlamaService } from "./services/defillama.service";
import { getProtocolTvlAction } from "./actions/getProtocolTvl.action";
import { getYieldRatesAction } from "./actions/getYieldRates.action";
import { getYieldHistoryAction } from "./actions/getYieldHistory.action";

export const defiLlamaPlugin: Plugin = {
  name: "plugin-defillama",
  description: "DeFiLlama integration: protocol TVL lookups, yield opportunities, and historical trends",
  actions: [getProtocolTvlAction, getYieldRatesAction, getYieldHistoryAction],
  evaluators: [],
  providers: [],
  services: [DefiLlamaService],
};

export default defiLlamaPlugin;
export { DefiLlamaService, getProtocolTvlAction, getYieldRatesAction, getYieldHistoryAction };


