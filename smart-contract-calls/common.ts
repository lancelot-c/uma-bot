import { BaseError, createPublicClient, createWalletClient, encodeFunctionData, encodePacked, http, parseAbiItem, PrivateKeyAccount, PublicClient, TransactionReceipt, WalletClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'
import { Redis } from '@upstash/redis'
import { umaContractAbi } from '../test/umaAbi'
import { addFailedWallet, addSuccessfulWallet, Answer } from '../test/utils'
import { decrypt } from "./encryption"

export const RPC_URL = process.env.RPC_URL
export const umaVotingV2ContractAddress = '0x004395edb43EFca9885CEdad51EC9fAf93Bd34ac'
export const umaContractAddress = umaVotingV2ContractAddress
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
export type TransactionHash = `0x${string}`

export const voteCommittedEvent = 'event VoteCommitted(address indexed voter, address indexed caller, uint32 roundId, bytes32 indexed identifier, uint256 time, bytes ancillaryData)'
export const voteRevealedEvent = 'event VoteRevealed(address indexed voter, address indexed caller, uint32 roundId, bytes32 indexed identifier, uint256 time, bytes ancillaryData, int256 price, uint128 numTokens)'

export const supportedPriceIdentifiers = [
    'YES_OR_NO_QUERY', // see spec at https://github.com/UMAprotocol/UMIPs/blob/master/UMIPs/umip-107.md
    'ASSERT_TRUTH', // For Story Protocol
    'Admin', // Governance vote (i.e. "Gas Rebate Program Refund | Jan 2024 - Dec 2024" has price identifier "Admin 206")
    'ACROSS-V2', // see spec at https://github.com/UMAprotocol/UMIPs/blob/895287dedcd6e9cfee30b84137b5823a6549afbc/UMIPs/umip-179.md
    'MULTIPLE_VALUES', // see voting round 10162 as an example && see spec at https://github.com/UMAprotocol/UMIPs/blob/master/UMIPs/umip-183.md
] as const;
export type PriceIdentifier = (typeof supportedPriceIdentifiers)[number];

export const MAX_INT256 = 57896044618658097711785492504343953926634992332820282019728792003956564819
// OR export const MAX_INT256 = Number((BigInt(2) ** BigInt(255)) - BigInt(1)) // from https://github.com/UMAprotocol/UMIPs/blob/master/UMIPs/umip-183.md

export const COMMIT_PHASE = 0
export const REVEAL_PHASE = 1

/* ANSWERS */
export const YES_ANSWERS = ['yes', 'true', 'valid', 'p2', '1']
export const NO_ANSWERS = ['no', 'false', 'invalid', 'p1', '0']

// To get the below values, go to a reveal transaction on Etherscan, then select "Transaction Decoder" in the dropdown on the right
export const P1_VALUE: bigint = BigInt(0);
export const P2_VALUE: bigint = BigInt(1000000000000000000);
export const P3_VALUE: bigint = BigInt(500000000000000000);
export const P4_VALUE: bigint = BigInt(-57896044618658097711785492504343953926634992332820282019728792003956564819968);

export const ASSERT_TRUTH_FALSE: bigint = BigInt(0);
export const ASSERT_TRUTH_TRUE: bigint = BigInt(1000000000000000000);

export const ALWAYS_APPROVE_GOVERNANCE_PROPOSALS = false // Set to false to enable customization, set to true to accept all governance proposals
export const GOVERNANCE_NO: bigint = BigInt(0);
export const GOVERNANCE_YES: bigint = BigInt(1000000000000000000);

export const ACROSS_INVALID: bigint = BigInt(0);
export const ACROSS_VALID: bigint = BigInt(1000000000000000000);


export const TIMEOUT_ACTION = 3*60; // in seconds
export const DELAY_ACTION = 10; // in seconds (TODO: progressively lower this to 0 to perform actions as fast as possible)
export const TIMEOUT_RECEIPT = 10*60; // in seconds
export const GAS_PREMIUM = BigInt(30) // add 30% gas premium to make sure transactions do not fail


export function createRedisInstance(): Redis {
    return new Redis({
        url: process.env.UPSTASH_URL,
        token: process.env.UPSTASH_API_KEY,
    })
}

export function createPublicEthClient(): PublicClient {
    return createPublicClient({
        chain: mainnet,
        transport: http(RPC_URL),
    })
}

export function createWalletEthClient(): WalletClient {
    return createWalletClient({
        chain: mainnet,
        transport: http(RPC_URL),
    })
}

export function isValidPriceIdentifier(priceIdentifier: any): priceIdentifier is PriceIdentifier {

    return supportedPriceIdentifiers.includes(priceIdentifier)
}

// Return true if successful, false otherwise
export async function sendMulticallTransaction(args: Array<TransactionHash>, account: PrivateKeyAccount, publicClient: PublicClient, walletClient: WalletClient, lastRequest?: any): Promise<TransactionHash> {

    if (args.length === 0) {
        logError(`Cannot send multicall with no args`)
        return ZERO_ADDRESS
    }

    // Only send multicall if there is more than 1 call, otherwise call the method directly (gas optimization)
    if (args.length === 1 && !!lastRequest) {
        return await writeContract(lastRequest, walletClient, publicClient)
    }

    const multicallArgs = [args]

    return await simulateTransactionAndWriteContract('multicall', multicallArgs, account, publicClient, walletClient)

}

export async function simulateTransactionAndWriteContract(functionName: string, args: unknown[], account: PrivateKeyAccount, publicClient: PublicClient, walletClient: WalletClient): Promise<TransactionHash> {

    const request = await simulateTransaction(functionName, args, account, publicClient)

    if (!request) {
        console.log(`🙅‍♂️ Abort ${functionName} transaction\n`)
        return ZERO_ADDRESS
    }

    return await writeContract(request, walletClient, publicClient)
}

// Returns the transaction hash
export async function writeContract(request: any, walletClient: WalletClient, publicClient: PublicClient): Promise<TransactionHash> {

    let transactionHash: TransactionHash = ZERO_ADDRESS

    /* ⚠️ Viem bug:
    walletClient.writeContract doesn't estimate the gas properly and therefore result in a failed transaction 30% of the time with the "out of gas" error
    The workaround is to manually add the gas to the request (option 1 - preferred) or to call walletClient.sendTransaction instead (option 2)
    */

    // Option 1
    console.log('Request default gas: ', request.gas)
    await addGasToRequest(request, publicClient)
    console.log('Set request gas to: ', request.gas)

    if (request.gas) {
        transactionHash = await walletClient.writeContract(request)
    }


    // Option 2
    // transactionHash = await sendTransactionFromRequest(request, walletClient, publicClient)
    

    console.log(`Transaction hash: ${transactionHash}`, `\n`)
    return transactionHash;
}

// Return request if successful, undefined otherwise
export async function simulateTransaction(functionName: string, args: unknown[], account: PrivateKeyAccount, publicClient: PublicClient): Promise<any | undefined> {

    try {

        console.log(`⚙️ Simulating ${functionName}...\n`); // with args:\n`, args, `and account ${account.address}\n`)

        const { request } = await publicClient.simulateContract({
            address: umaContractAddress,
            abi: umaContractAbi,
            functionName,
            args,
            account,
        })

        console.log(`✅ Simulation successful\n`)
        return request

    } catch (err) {

        if (err instanceof BaseError) {

            let errorTitle = `Simulation failed with error ${err.name}`
            let errorMessage = `Error message: ${err.shortMessage}\nError details: ${err.details}\n`

            if (err.docsPath) {
                errorMessage += `Error docs path: ${err.docsPath}\n`
            }

            logError(errorMessage, errorTitle)

        } else {
            logError(`${err}`, `Simulation failed with unknown error`)
        }

        return undefined
    }

}

// Send a transaction based on a request returned from publicClient.simulateContract
export async function sendTransactionFromRequest(request: any, walletClient: WalletClient, publicClient: PublicClient): Promise<`0x${string}`> {

    const data = encodeFunctionData({
        abi: umaContractAbi,
        functionName: request.functionName,
        args: request.args
    })

    const gas = await estimateGas(request.functionName, request.args, request.account, publicClient)

    return await sendTransaction(request.account, data, walletClient, gas)
}

export async function sendTransaction(account: PrivateKeyAccount, data: `0x${string}`, walletClient: WalletClient, gas?: bigint): Promise<`0x${string}`> {

    console.log('sendTransaction with gas: ', gas)

    const hash = await walletClient.sendTransaction({
        account,
        to: umaContractAddress,
        chain: mainnet,
        data,
        gas
    })

    return hash
}

export async function estimateGas(functionName: string, args: any[], account: PrivateKeyAccount, publicClient: PublicClient): Promise<bigint | undefined> {

    let gas: bigint | undefined = undefined

    try {

        gas = await publicClient.estimateContractGas({
            address: umaContractAddress,
            abi: umaContractAbi,
            functionName,
            args,
            account,
        })
    
        gas = gas + (gas * GAS_PREMIUM) / 100n; // Add gas premium to prevent transactions to fail

    } catch (err) {
        logError(`${err}`, `estimateContractGas failed for ${account.address}`)
    }
    
    return gas;
}

export async function addGasToRequest(request: any, publicClient: PublicClient): Promise<void> {

    request.gas = await estimateGas(request.functionName, request.args, request.account, publicClient)

}


export async function generateSalt(account: PrivateKeyAccount, request: PendingRequestFormatted): Promise<bigint> {

    // Signing ensures that only the voter can generate the salt
    const signature = await account.signMessage({
        message: {
            raw: encodePacked(
                ['uint256', 'bytes32', 'int256', 'bytes'],
                [request.roundId, request.identifier, request.time, request.ancillaryData]
            )
        }
    })
    // console.log(`signature: ${signature}\n`)

    const salt = BigInt(parseInt(signature) % MAX_INT256) // "%" is needed otherwise the number is too big to be converted to int256 in encodePacked
    console.log(`salt:\n${salt}\n\n`)

    return salt
}

// Return the encoded price as a bigint or undefined if the price couldn't be determined
export function encodePrice(answer: string, priceIdentifier: PriceIdentifier): bigint | undefined {

    console.log(`answer:\n${answer}\n`)
    let encodedPrice: bigint | undefined = undefined;

    if (!answer) {
        return encodedPrice
    }

    if (priceIdentifier === "YES_OR_NO_QUERY") {

        if (answer === "P1") {
            encodedPrice = P1_VALUE
        } else if (answer === "P2") {
            encodedPrice = P2_VALUE
        } else if (answer === "P3") {
            encodedPrice = P3_VALUE
        } else if (answer === "P4") {
            encodedPrice = P4_VALUE
        }

    } else if (priceIdentifier === "ASSERT_TRUTH") {

        if (isYes(answer)) {
            encodedPrice = ASSERT_TRUTH_TRUE
        } else if (isNo(answer)) {
            encodedPrice = ASSERT_TRUTH_FALSE
        }

    } else if (priceIdentifier === "Admin") {

        if (ALWAYS_APPROVE_GOVERNANCE_PROPOSALS) {
            encodedPrice = GOVERNANCE_YES
        } else {

            if (isYes(answer)) {
                encodedPrice = GOVERNANCE_YES
            } else if (isNo(answer)) {
                encodedPrice = GOVERNANCE_NO
            }

        }

    } else if (priceIdentifier === "ACROSS-V2") {

        if (isYes(answer)) {
            encodedPrice = ACROSS_VALID
        } else if (isNo(answer)) {
            encodedPrice = ACROSS_INVALID
        }

    } else if (priceIdentifier === "MULTIPLE_VALUES") {

        if (Number.isInteger(answer)) {
            encodedPrice = BigInt(answer);
        }

    }

    console.log(`price:\n${encodedPrice}\n`)
    return encodedPrice;
}

export function isYes(answer: string): boolean {
    answer = answer.toLowerCase()
    return YES_ANSWERS.includes(answer)
}

export function isNo(answer: string): boolean {
    answer = answer.toLowerCase()
    return NO_ANSWERS.includes(answer)
}

// Return supported PriceIdentifier or undefined if identifier is not supported
export function decodeIdentifier(identifier: `0x${string}`): PriceIdentifier | undefined {

    // console.log(`requestIdentifier:\n${identifier}\n\n`)

    let decodedIdentifier = decodeURIComponent(identifier.slice(2).replace(/\s+/g, '').replace(/[0-9a-f]{2}/g, '%$&')); // converts a hex encoded UTF-8 string to a regular string, see https://stackoverflow.com/a/13865680
    decodedIdentifier = decodedIdentifier.replace(/\0/g, '') // removes null characters, see https://stackoverflow.com/a/22809513
    decodedIdentifier = decodedIdentifier.startsWith("Admin") ? "Admin" : decodedIdentifier // Governance vote identifiers
    console.log(`decodedIdentifier:\n${decodedIdentifier}\n\n`)

    if (isValidPriceIdentifier(decodedIdentifier)) {

        return decodedIdentifier

    } else {

        const errorTitle = `Price identifier '${decodedIdentifier}' not supported`
        const errorMessage = `Supported price identifiers are: '${supportedPriceIdentifiers.join(`', '`)}'`

        logError(errorMessage, errorTitle)
        return undefined
    }

}

export async function postInDevChannel(title: string, message: string, color: number, webhookUrl?: string): Promise<void> {

    const embed = {
        "title": title,
        "description": message,
        "color": color,  // decimal index of a color, see https://www.spycolor.com
    }

    const params = {
        // "content": ``,
        "embeds": [embed]
    }

    if (!webhookUrl) {
        webhookUrl = process.env.DISCORD_CHANNEL_DEV_WEBHOOK_URL as string
    }

    await fetch(webhookUrl, {
        method: "POST",
        headers: {
            'Content-type': 'application/json'
        },
        body: JSON.stringify(params)
    }).then(res => {

        console.log(`Discord webhook response: { status: ${res.status}, statusText: ${res.statusText}, ok: ${res.ok} }`);

    }).catch(err => {

        console.error(err) // Do not use logError here because it can create an infinite loop between postInDevChannel and logError

    })
}

// Warning: Below function does not work because the PriceRequests returned do not have the voteInstances property - Viem bug

// export async function getPriceRequests(request: PendingRequestFormatted, publicClient: PublicClient): Promise<Array<any>> { // Promise<Array<PriceRequest>>

//     const requestHash = keccak256(
//         encodeAbiParameters(
//             parseAbiParameters('bytes32 identifier, uint256 time, bytes memory ancillaryData'), 
//             [request.identifier, request.time, request.ancillaryData]
//         )
//     )
//     console.log(`requestHash:`, requestHash)

//     return await publicClient.readContract({
//         address: umaContractAddress,
//         abi: umaContractAbi,
//         functionName: 'priceRequests',
//         args: [requestHash]
//     }) as Array<any> // Array<PriceRequest>

// }

// export type PriceRequest = {
//     lastVotingRound: number
//     isGovernance: boolean
//     time: number
//     rollCount: number
//     identifier: `0x${string}`
//     voteInstances: { [roundId: number] : VoteInstance; }
//     ancillaryData: `0x${string}`
// }

// export type VoteInstance = {
//     voteSubmissions: { [voterAddress: `0x${string}`] : VoteSubmission; } // Maps (voter) to their submission.
// }

// export type VoteSubmission = {
//     commit: `0x${string}` // A bytes32 of 0 indicates no commit or a commit that was already revealed.
//     revealHash: `0x${string}` // The hash of the value that was revealed. This is only used for computation of rewards.
// }


export async function getPendingRequests(publicClient: PublicClient): Promise<Array<PendingRequestAncillaryAugmented>> {

    return await publicClient.readContract({
        address: umaContractAddress,
        abi: umaContractAbi,
        functionName: 'getPendingRequests',
    }) as Array<PendingRequestAncillaryAugmented>

}

export async function getFormattedRequests(publicClient: PublicClient): Promise<Array<PendingRequestFormatted>> {

    console.log(`⚙️ Retrieving requests...\n`)
    const requests = await getPendingRequests(publicClient)
    if (requests.length == 0) {
        logError(`No request detected`)
        return []
    }

    const votingRound = requests[0].lastVotingRound
    const answers = await getAnswers(votingRound)
    if (answers === undefined) {
        logError(`No answer detected in answers file`)
        return []
    }

    if (requests.length != answers.length) {
        logError(`Number of requests (${requests.length}) is different from number of answers in answers.json (${answers.length})`)
        return []
    }

    const formattedRequests: Array<PendingRequestFormatted> = []

    for (let i = 0; i < requests.length; i++) {

        console.log(`****** Request #${i + 1} ******\n`)
        const r = requests[i]

        const answer = answers.find(a => a.ancillaryData == r.ancillaryData)
        if (answer === undefined) {
            logError(`Couldn't find any answer matching the ancillaryData for request ${i + 1}`)
            continue;
        }

        if (answer.skip === true) {
            logError(`Skip = true for request ${i + 1}`)
            continue;
        }

        // const decodedAncillaryData = decodeURIComponent(r.ancillaryData.slice(2).replace(/\s+/g, '').replace(/[0-9a-f]{2}/g, '%$&')); // converts a hex encoded UTF-8 string to a regular string, see https://stackoverflow.com/a/13865680
        // console.log(`decodedAncillaryData:\n${decodedAncillaryData}\n\n`)

        const decodedRequestIdentifier = decodeIdentifier(r.identifier)
        if (decodedRequestIdentifier === undefined) {
            logError(`Identifier is undefined for request ${i + 1}`)
            continue
        }

        const price = encodePrice(answer.answer, decodedRequestIdentifier)
        if (price === undefined) {
            logError(`Price is undefined for request ${i + 1}`)
            continue
        }

        formattedRequests.push({
            roundId: BigInt(r.lastVotingRound),
            identifier: r.identifier,
            ancillaryData: r.ancillaryData,
            time: BigInt(r.time),
            price,
            force: answer.force
        })

    }

    return formattedRequests
}

// As in UMA smart contract
export type PendingRequestAncillaryAugmented = {
    lastVotingRound: number
    isGovernance: boolean
    time: number
    rollCount: number
    identifier: `0x${string}`
    ancillaryData: `0x${string}`
}

// Formatted for use in UMA.rocks
export type PendingRequestFormatted = {
    roundId: bigint
    identifier: `0x${string}`
    ancillaryData: `0x${string}`
    time: bigint
    price: bigint
    force?: boolean
}

export type EventSummary = {
    found: boolean,
    transactionHash?: `0x${string}`,
    madeByDelegator?: boolean
    madeByDelegate?: boolean
}


// 0: Commit - 1: Reveal
export async function getCurrentPhase(publicClient: PublicClient): Promise<number> {

    return await publicClient.readContract({
        address: umaContractAddress,
        abi: umaContractAbi,
        functionName: 'getVotePhase',
    }) as number

}

// Accepts a delegation request from a delegator
export async function setDelegator(delegatorAddress: `0x${string}`, delegateAccount: PrivateKeyAccount, publicClient: PublicClient, walletClient: WalletClient): Promise<TransactionHash> {

    return await simulateTransactionAndWriteContract('setDelegator', [delegatorAddress], delegateAccount, publicClient, walletClient)

}

/* ⚠️ WARNING: this function should be called very carefully and strong checks should be made before calling it
 as there is no way to recover delegators once they are removed except by manually asking them to rejoin the pool */
export async function removeDelegator(delegateAccount: PrivateKeyAccount, publicClient: PublicClient, walletClient: WalletClient): Promise<TransactionHash> {

    return await setDelegator(ZERO_ADDRESS, delegateAccount, publicClient, walletClient)

}

export async function getPendingAccounts(redis: Redis): Promise<PrivateKeyAccount[]> {

    const pendingMembers: any = (await redis.get("PENDING") as any).all
    return pendingMembers.map((member: any) => privateKeyToAccount(`0x${decrypt(member.b as string)}`))

}

export function getDelegatePrivateKeys(): `0x${string}`[] {

    return (process.env.PRIVATE_KEYS as string).split(',').map(key => `0x${decrypt(key)}`) as `0x${string}`[]

}

export function getDelegateAccounts(): PrivateKeyAccount[] {

    return getDelegatePrivateKeys().map(key => privateKeyToAccount(key))

}

export function getDelegateAddresses(): `0x${string}`[] {

    return getDelegateAccounts().map(account => account.address)

}

export async function getLogs(eventAbiItem: string, args: any, publicClient: PublicClient, days?: number): Promise<any> {

    return await publicClient.getLogs({
        address: umaContractAddress,
        event: parseAbiItem(eventAbiItem) as any,
        args,
        fromBlock: await blockNumberFromXDaysAgo(days || 2, publicClient), // to avoid reaching rate limits on RPC providers
        toBlock: 'latest',
        strict: true
    })

}


export async function blockNumberFromXDaysAgo(days: number, publicClient: PublicClient): Promise<bigint> {

    let blockNumber = await publicClient.getBlockNumber()
    const MAX_BLOCKS_PER_DAY = 7500 // see https://ycharts.com/indicators/ethereum_blocks_per_day
    blockNumber -= BigInt(days * MAX_BLOCKS_PER_DAY)
    return blockNumber

}


export async function getEventLogs(eventAbiItem: string, delegatorAddress: `0x${string}`, roundId: bigint, publicClient: PublicClient): Promise<Array<any>> {

    console.log(`⚙️ Retrieving voter logs for this voting round...`)

    const args = {
        voter: delegatorAddress
    }

    const logs = await getLogs(eventAbiItem, args, publicClient)
    const filteredLogs = logs.filter((log: any) => log.args.roundId == roundId)
    console.log(`${filteredLogs.length} logs found`)

    return filteredLogs
}

export function searchForEvent(delegatorAddress: `0x${string}`, delegateAddress: `0x${string}`, request: PendingRequestFormatted, voterLogs: Array<any>): EventSummary {

    console.log(`⚙️ Checking if commit/reveal has already been made...`)

    const voteLog = voterLogs.find(log => log.args.ancillaryData == request.ancillaryData
        && log.args.time == request.time
        && log.args.identifier == request.identifier)
    const voteFound = !!voteLog

    let eventSummary: EventSummary = {
        found: voteFound
    }

    if (voteFound) {
        eventSummary.transactionHash = voteLog.transactionHash
        eventSummary.madeByDelegator = voteLog.args.caller == delegatorAddress
        eventSummary.madeByDelegate = voteLog.args.caller == delegateAddress
    }

    console.log('eventSummary:\n', eventSummary)
    return eventSummary
}

/* Warning: do not use getVoterFromDelegate function from the UMA smart contract
as it will output its input address even if there is no delegator */
export async function getDelegatorsFromDelegates(redis: Redis, delegateAddresses: `0x${string}`[]): Promise<{ [delegate: `0x${string}`]: `0x${string}` }> {

    const poolMembers: any[] = (await redis.get("MEMBERS") as any).all
    const mapping: { [delegate: `0x${string}`]: `0x${string}` } = {}

    delegateAddresses.forEach(delegateAddress => {
        const poolMember = poolMembers.find(m => `0x${m.delegate}` === delegateAddress)
        const delegatorFound = !!poolMember

        const delegatorAddress: `0x${string}` = delegatorFound ? `0x${poolMember.delegator}` : ZERO_ADDRESS
        mapping[delegateAddress] = delegatorAddress
    })

    return mapping
}

// Skip wallet only if all disputes have been committed/revealed
export function shouldSkipWallet(eventSummaries: EventSummary[], nbDisputes: number): boolean {
    return eventSummaries.filter(s => s.found).length == nbDisputes
}


export function umaRocksAlreadyDidSomething(eventSummaries: EventSummary[]): boolean {
    return eventSummaries.some(s => s.madeByDelegate === true)
}

export async function getTempAnswers(votingRound: number): Promise<Answer[] | undefined> {

    const answersFilepath = `../test-data/${votingRound}.json`

    const { default: answersFile } = await import(answersFilepath, {
        with: { type: "json" },
    });

    console.log(`Content of ${answersFilepath}`)
    console.log(answersFile)

    return parseAnswersFile(answersFile)
}

export async function getAnswers(votingRound: number): Promise<Answer[] | undefined> {

    const answersFileUrl = `https://raw.githubusercontent.com/lancelot-c/uma-answers/refs/heads/main/voting-rounds/${votingRound}.json`
    console.log(`Fetching answers from ${answersFileUrl}`)

    let answersFile;

    try {

        const response = await fetch(answersFileUrl);
        if (!response.ok) {
            logError(`Response status: ${response.status}`);
            return undefined
        }
    
        answersFile = await response.json();
        console.log(JSON.stringify(answersFile))

    } catch (error: any) {
        logError(error.message);
        return undefined
    }

    return parseAnswersFile(answersFile)
}

function parseAnswersFile(answersFile: any): Answer[] | undefined {

    if (!Array.isArray(answersFile) || answersFile.length == 0) {
        return undefined
    }

    for (let i = 0; i < answersFile.length; i++) {

        const a = answersFile[i]

        if (!a.hasOwnProperty('ancillaryData') || !a.hasOwnProperty('answer')) {
            return undefined
        }
    }

    return answersFile as Answer[]
}

// Wait for p to resolve or resolve automatically after timeout seconds
// returns the result of p if p resolved before setTimeout resolved, false otherwise
export async function PromiseWithTimeout(p: Promise<TransactionHash>, timeout: number): Promise<TransactionHash | false> {

    return new Promise<TransactionHash | false>(async (resolve) => {

        const timeoutID = setTimeout(() => {
            resolve(false)
        }, timeout * 1000)

        let transactionHash: TransactionHash = ZERO_ADDRESS;

        // Protection to prevent an action failure from stopping the next actions
        try {
            transactionHash = await p;
        } catch (err) {
            logError(`${err}`, `Action failed`)
        }
        
        clearTimeout(timeoutID);
        resolve(transactionHash)
    });

}

// Resolves after `delay` seconds
export async function wait(delay: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, delay * 1000));
}

// action promise should return the transaction hash if a transaction was made during the action, ZERO_ADDRESS otherwise
export async function takeActionForAccounts(action: (account: PrivateKeyAccount, i: number) => Promise<TransactionHash>, accounts: PrivateKeyAccount[], publicClient: PublicClient): Promise<any[]> {

    const hashes: TransactionHash[] = []

    // Perform all contract interactions
    for (let i = 0; i < accounts.length; i++) {

        const result = await PromiseWithTimeout(action(accounts[i], i), TIMEOUT_ACTION)

        // Add a small delay between transactions to prevent gas from increasing
        const transactionWasJustMade = (result != ZERO_ADDRESS && result != false)
        const isntLastAction = i < accounts.length - 1
        let hash: TransactionHash = ZERO_ADDRESS

        if (transactionWasJustMade) {

            hash = result

            if (isntLastAction) {
                await wait(DELAY_ACTION)
            }

        }

        hashes.push(hash)

    }

    // Request all transaction receipts
    let receiptPromises: Promise<TransactionReceipt>[] = []
    let addressMap: `0x${string}`[] = [] // Enable receipt to address mapping

    for (let i = 0; i < hashes.length; i++) {

        let hash = hashes[i]

        if (hash == ZERO_ADDRESS) {
            continue;
        }

        const receiptPromise = publicClient.waitForTransactionReceipt({
            hash: hash,
            timeout: TIMEOUT_RECEIPT * 1000
            // pollingInterval: 5000,
            // retryCount: 12,
            // retryDelay: 15000
        })

        receiptPromises.push(receiptPromise)
        addressMap.push(accounts[i].address)
    }

    // Validate all transaction receipts
    const results = await Promise.allSettled(receiptPromises)
        
    for (let i = 0; i < results.length; i++) {

        const accountAddress = addressMap[i]

        if (results[i].status == "fulfilled") {

            const promiseResult = results[i] as unknown as PromiseFulfilledResult<TransactionReceipt>
            const transactionReceipt = promiseResult.value
            const transactionHash = transactionReceipt.transactionHash

            if (transactionReceipt.status == "success") {
            
                console.log(`✅ Transaction confirmed for ${accountAddress}`)
                addSuccessfulWallet(accountAddress, transactionHash)
    
            } else {
                
                logError(`Transaction reverted for ${accountAddress}`)
                addFailedWallet(accountAddress, transactionHash)
            
            }

        } else {

            const promiseResult = results[i] as unknown as PromiseRejectedResult
            const rejectionReason = promiseResult.reason
            logError(`${rejectionReason}`, `waitForTransactionReceipt failed for ${accountAddress}`)
            addFailedWallet(accountAddress)

        }

    }

    return hashes;
}

export async function logError(errorMessage: string, errorTitle?: string): Promise<void> {

    if (errorTitle) {
        console.error(`❌ ${errorTitle}.\n${errorMessage}\n`)
    } else {
        console.error(`❌ ${errorMessage}\n`)
    }

    const redColor = 14221312
    await postInDevChannel(`❌ ${errorTitle || ''}`, errorMessage, redColor)
}

export async function logInfo(infoTitle: string, infoMessage?: string, webhookUrl?: string): Promise<void> {

    if (infoMessage) {
        console.warn(`ℹ️ ${infoTitle}.\n${infoMessage}\n`)
    } else {
        console.warn(`ℹ️ ${infoTitle}\n`)
    }

    const greenColor = 2064972
    await postInDevChannel(`ℹ️ ${infoTitle}`, infoMessage || '', greenColor, webhookUrl)
}