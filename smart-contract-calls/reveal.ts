import { encodeFunctionData, PrivateKeyAccount } from 'viem'
import { umaContractAbi } from './../test/umaAbi'
import { searchForEvent, createPublicEthClient, createRedisInstance, createWalletEthClient, generateSalt, getCurrentPhase, getDelegateAccounts, getDelegatorsFromDelegates, getFormattedRequests, getEventLogs, sendMulticallTransaction, simulateTransaction, ZERO_ADDRESS, EventSummary, shouldSkipWallet, takeActionForAccounts, logError, voteRevealedEvent, voteCommittedEvent, umaRocksAlreadyDidSomething } from './common'
import { addFailedWallet, addSkippedWallet, addSuccessfulWallet } from '../test/utils'

const publicClient = createPublicEthClient()

if ((await getCurrentPhase(publicClient)) != 1) {
    throw Error('Not reveal phase. Exit job.')
}

const requests = await getFormattedRequests(publicClient)

if (requests.length == 0) {
    throw Error('No pending request detected. Exit job.')
}

const delegateAccounts = getDelegateAccounts()

if (delegateAccounts.length == 0) {
    throw Error('No delegate account detected. Exit job.')
}

const redis = createRedisInstance()
const delegateToDelegator = await getDelegatorsFromDelegates(redis, delegateAccounts.map(a => a.address))
const roundId = requests[0].roundId
const nbDisputes = requests.length

// Reveal votes for all wallets
await takeActionForAccounts(revealForAccount, delegateAccounts)


// Return the transaction hash if a transaction was made, ZERO_ADDRESS otherwise
async function revealForAccount(account: PrivateKeyAccount, i: number): Promise<`0x${string}`> {

    const delegateAddress = account.address
    const delegatorAddress = delegateToDelegator[delegateAddress]
    console.log(`\n*** Reveal for wallet #${i+1}: ${delegateAddress} ***\n`)

    if (delegatorAddress == ZERO_ADDRESS) {
        logError(`Couldn't find delegator in database`)
        return ZERO_ADDRESS;
    }

    const commitLogs = await getEventLogs(voteCommittedEvent, delegatorAddress, roundId, publicClient)
    const revealLogs = await getEventLogs(voteRevealedEvent, delegatorAddress, roundId, publicClient)

    // Compute transaction data
    let commitOrRevealEvents: EventSummary[] = [] // Event summaries of transactions that are the reason why we cannot reveal, or { found: false } when we can reveal
    let revealsData: Array<`0x${string}`> = []
    let lastRequest: any;

    for (let j = 0; j < requests.length; j++) {

        console.log(`****** revealVote #${j+1} ******\n`)
        const r = requests[j]

        const revealEvent = searchForEvent(delegatorAddress, delegateAddress, r, revealLogs)
        if (revealEvent.found) {
            console.log(`Reveal was already made at transaction ${revealEvent.transactionHash}`)
            console.log(`🙅‍♂️ Skipping reveal for this dispute`)
            commitOrRevealEvents.push(revealEvent)
            continue;
        }

        const commitEvent = searchForEvent(delegatorAddress, delegateAddress, r, commitLogs)
        if (!commitEvent.found || !commitEvent.madeByDelegate) {
            console.log(`Commit wasn't made at all or wasn't made by us ${(commitEvent.transactionHash) ? `- (see transaction ${commitEvent.transactionHash})` : ``}`)
            console.log(`🙅‍♂️ Skipping reveal for this dispute`)
            commitEvent.found = true // Enable shouldSkipWallet() to return true
            commitOrRevealEvents.push(commitEvent)
            continue;
        }
        commitOrRevealEvents.push({ found: false })
        
        const salt = await generateSalt(account, r)

        const args = [
            r.identifier,
            r.time,
            r.price,
            r.ancillaryData,
            salt
        ]

        const request = await simulateTransaction('revealVote', args, account, publicClient)
        if (!request) {
            // The simulation will fail if the delegator has committed on its own
            console.log(`🙅‍♂️ Skipping reveal for this dispute`)
            continue
        }
        lastRequest = request

        const revealData = encodeFunctionData({
            abi: umaContractAbi,
            functionName: 'revealVote',
            args
        })

        revealsData.push(revealData)

    }

    console.log(`\n******************************************************************************\n`)
    console.log(`👌 Ready to reveal\n`)

    console.log('eventSummaries:\n', commitOrRevealEvents)
    if (shouldSkipWallet(commitOrRevealEvents, nbDisputes)) {
        console.log(`🙅‍♂️ Skipping delegate ${account.address} because every vote was either already revealed, not committed at all, or not committed by us`)
        
        // We count the wallet as successfull if we have revealed at least one vote
        if (umaRocksAlreadyDidSomething(commitOrRevealEvents)) {
            addSuccessfulWallet(account.address)
        } else {
            addSkippedWallet(account.address)
        }

        return ZERO_ADDRESS;
    }

    const walletClient = createWalletEthClient()
    const [successful, transactionReceipt] = await sendMulticallTransaction(revealsData, account, publicClient, walletClient, lastRequest);
    
    const nbRevealed = successful ? revealsData.length : 0
    console.log(`👁️ ${nbRevealed}/${nbDisputes} votes revealed\n`)

    if (successful) {
        addSuccessfulWallet(account.address, transactionReceipt?.transactionHash)
    } else {
        addFailedWallet(account.address, transactionReceipt?.transactionHash)
    }

    return (transactionReceipt ? transactionReceipt.transactionHash : ZERO_ADDRESS);
}