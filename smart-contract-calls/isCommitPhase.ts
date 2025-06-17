import { COMMIT_PHASE, createPublicEthClient, getCurrentPhase, getPendingRequests } from "./common";

const publicClient = createPublicEthClient()

// We need to be in commit phase && not have an empty voting round
if ((await getCurrentPhase(publicClient)) != COMMIT_PHASE || (await getPendingRequests(publicClient)).length == 0) {
    throw Error('Not commit phase. Exit job.')
}