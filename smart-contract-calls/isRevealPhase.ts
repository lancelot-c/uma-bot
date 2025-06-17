import { createPublicEthClient, getCurrentPhase, getPendingRequests, REVEAL_PHASE } from "./common";

const publicClient = createPublicEthClient()

// We need to be in reveal phase && not have an empty voting round
if ((await getCurrentPhase(publicClient)) != REVEAL_PHASE || (await getPendingRequests(publicClient)).length == 0) {
    throw Error('Not reveal phase. Exit job.')
}