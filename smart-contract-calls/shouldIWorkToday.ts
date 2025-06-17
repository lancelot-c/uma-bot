import { COMMIT_PHASE, createPublicEthClient, decodeIdentifier, getCurrentPhase, getPendingRequests, logInfo } from "./common";

const publicClient = createPublicEthClient()

const isCommitPhase = (await getCurrentPhase(publicClient)) == COMMIT_PHASE
const requests = await getPendingRequests(publicClient)
const hasRequests = requests.length > 0
const shouldCommitToday = isCommitPhase && hasRequests

if (shouldCommitToday) {

    await logInfo(`${requests.length} answer${requests.length > 1 ? 's' : ''} to find today`)

    // decodeIdentifier automatically calls logError when price identifier isn't supported
    requests.forEach(r => { decodeIdentifier(r.identifier) })

}