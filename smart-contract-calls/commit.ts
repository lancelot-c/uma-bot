import { keccak256, encodeFunctionData, encodePacked, PrivateKeyAccount } from 'viem'
import { umaContractAbi } from './../test/umaAbi'
import { searchForEvent, createPublicEthClient, createRedisInstance, createWalletEthClient, generateSalt, getCurrentPhase, getDelegateAccounts, getDelegatorsFromDelegates, getFormattedRequests, getEventLogs, sendMulticallTransaction, simulateTransaction, ZERO_ADDRESS, EventSummary, shouldSkipWallet, takeActionForAccounts, logError, voteCommittedEvent, umaRocksAlreadyDidSomething, TransactionHash } from './common'
import { addFailedWallet, addSkippedWallet, addSuccessfulWallet } from '../test/utils'

const publicClient = createPublicEthClient()

if ((await getCurrentPhase(publicClient)) != 0) {
    throw Error('Not commit phase. Exit job.')
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
const commitParamEncryptedVote = `` // seems to be optional

// Commit votes for all wallets
await takeActionForAccounts(commitForAccount, delegateAccounts, publicClient)


// Return the transaction hash if a transaction was made, ZERO_ADDRESS otherwise
async function commitForAccount(account: PrivateKeyAccount, i: number): Promise<TransactionHash> {

    const delegateAddress = account.address
    const delegatorAddress = delegateToDelegator[delegateAddress]
    console.log(`\n*** Commit for wallet #${i+1}: ${delegateAddress} ***\n`)

    if (delegatorAddress == ZERO_ADDRESS) {
        logError(`Couldn't find delegator in database`)
        return ZERO_ADDRESS;
    }

    const commitLogs = await getEventLogs(voteCommittedEvent, delegatorAddress, roundId, publicClient)

    // Compute transaction data
    let commitEvents: EventSummary[] = [] // Event summaries of transactions that are the reason why we cannot commit, or { found: false } when we can commit
    let commitsData: Array<`0x${string}`> = []
    let lastRequest: any;

    for (let j = 0; j < requests.length; j++) {

        console.log(`****** commitAndEmitEncryptedVote #${j+1} ******\n`)
        const r = requests[j]

        if (r.force) {
            
            console.log(`🔥 Force commit for this dispute`)
            commitEvents.push({ found: false })

        } else {
            
            const commitEvent = searchForEvent(delegatorAddress, delegateAddress, r, commitLogs)
            commitEvents.push(commitEvent)
            
            if (commitEvent.found) {
                console.log(`Commit was already made at transaction ${commitEvent.transactionHash}`)
                console.log(`🙅‍♂️ Skipping commit for this dispute`)
                continue;
            }

        }

        const salt = await generateSalt(account, r)

        /*
            Below hash should match
            ['int256', 'int256', 'address', 'uint256', 'bytes', 'uint256', 'bytes32']
            keccak256(abi.encodePacked(price, salt, voter, time, ancillaryData, uint256(currentRoundId), identifier))
            in UMA smart contract
        */
        const commitParamHash = keccak256(
            encodePacked(
                ['int256', 'int256', 'address', 'uint256', 'bytes', 'uint256', 'bytes32'], 
                [r.price, salt, delegatorAddress, r.time, r.ancillaryData, r.roundId, r.identifier]
            )
        )
        // console.log(`commitParamHash: ${commitParamHash}`)

        const args = [
            r.identifier, // unique price pair identifier. E.g. BTC/USD price pair
            r.time, // unix timestamp of the price request
            r.ancillaryData, // arbitrary data appended to a price request to give the voters more info from the caller
            commitParamHash, // keccak256 hash of the price you want to vote for and a int256 salt
            commitParamEncryptedVote // offchain encrypted blob containing the voter's amount, time and salt
        ]

        const request = await simulateTransaction('commitAndEmitEncryptedVote', args, account, publicClient)
        if (!request) {
            console.log(`🙅‍♂️ Skipping commit for this dispute`)
            continue
        }
        lastRequest = request

        const commitData = encodeFunctionData({
            abi: umaContractAbi,
            functionName: 'commitAndEmitEncryptedVote',
            args
        })

        commitsData.push(commitData)

    }

    console.log(`\n******************************************************************************\n`)
    console.log(`👌 Ready to commit\n`)

    console.log('eventSummaries:\n', commitEvents)
    if (shouldSkipWallet(commitEvents, nbDisputes)) {
        console.log(`🙅‍♂️ Skipping delegate ${account.address} because all votes have been committed already`)
        
        // We count the wallet as successfull if we have committed at least one vote
        if (umaRocksAlreadyDidSomething(commitEvents)) {
            addSuccessfulWallet(account.address)
        } else {
            addSkippedWallet(account.address)
        }
        
        
        return ZERO_ADDRESS;
    }

    console.log(`Committing ${ commitsData.length } votes.`)
    const walletClient = createWalletEthClient()
    const hash = await sendMulticallTransaction(commitsData, account, publicClient, walletClient, lastRequest);
    
    return hash;
}