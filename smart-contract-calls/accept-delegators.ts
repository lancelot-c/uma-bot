import { PrivateKeyAccount, PublicClient, WalletClient } from 'viem'
import { umaContractAbi } from '../test/umaAbi'
import { umaContractAddress, setDelegator, createWalletEthClient, createPublicEthClient, createRedisInstance, getPendingAccounts, logError, getLogs } from './common'

const redis = createRedisInstance()
const pendingAccounts = await getPendingAccounts(redis)

if (pendingAccounts.length == 0) {
    throw Error('No pending account detected. Exit job.')
}

const publicClient = createPublicEthClient()

for (let i = 0; i < pendingAccounts.length; i++) {

    const account = pendingAccounts[i]
    const delegateAddress = account.address
    console.log(`*** Handling pending delegate ${delegateAddress} ***`)

    console.log(`⚙️ Checking the last delegation request onchain...`)

    const delegateSetEvent = 'event DelegateSet(address indexed delegator, address indexed delegate)'
    const args = {
        delegate: delegateAddress
    }
    const logs = await getLogs(delegateSetEvent, args, publicClient)


    if (logs.length > 0) {

        const latestLog = logs[logs.length - 1]
        // console.log('Latest DelegateSet event:')
        // console.log(latestLog);

        const latestDelegator = latestLog.args.delegator
        console.log(`Delegation request found from delegator ${latestDelegator}`)


        let shouldAcceptRequest: boolean = false

        console.log(`⚙️ Checking delegator stake...`)
        let response;

        try {

            response = await publicClient.readContract({
                address: umaContractAddress,
                abi: umaContractAbi,
                functionName: 'voterStakes',
                args: [latestDelegator]
            });

        } catch (err) {
            logError(err)
        }


        // Check UMA stake
        const umaStake = Math.round(Number(BigInt((response as any)[0]) / BigInt(10 ** 15)) / 1000);
        console.log(`UMA stake = ${umaStake}`)
        const minimumRequiredStake = Number(process.env.MINIMUM_UMA_STAKE)

        if (umaStake >= minimumRequiredStake) {

            console.log(`Valid UMA stake (>= ${minimumRequiredStake} UMA)`)

            // Check if there is no delegate yet
            const existingDelegate = String((response as any)[7]);
            // console.log(`existingDelegate = ${existingDelegate}`)

            // existingDelegate is always equal to delegateAddress when a delegation request is pending
            if (existingDelegate.toLowerCase() == delegateAddress.toLowerCase()) {
                shouldAcceptRequest = true
            } else {
                console.log(`The delegator's delegate address != Our delegate address\n${existingDelegate.toLowerCase()} != ${delegateAddress.toLowerCase()}\nMeaning that the delegator has cancelled his request after making it`)
            }

        } else {
            console.log(`UMA stake too low (< ${minimumRequiredStake} UMA)`)
        }


        if (shouldAcceptRequest) {
            console.log(`⚙️ Accepting delegation request...`)
            const walletClient = createWalletEthClient()
            await acceptDelegationRequest(delegateAddress, latestDelegator, umaStake, account, publicClient, walletClient)
        } else {
            console.log(`Delegation request ignored`)
        }



    } else {
        console.log(`No delegation request found`)
    }

}

async function acceptDelegationRequest(delegateAddress: `0x${string}`, stakerAddress: `0x${string}`, umaStake: number, account: PrivateKeyAccount, publicClient: PublicClient, walletClient: WalletClient) {
    
    const successful = await setDelegator(stakerAddress, account, publicClient, walletClient)

    if (successful) {
        await addToBackend(delegateAddress, stakerAddress, umaStake) 
    }

}

async function addToBackend(delegateAddress: `0x${string}`, stakerAddress: `0x${string}`, umaStake: number) {
    
    console.log('Adding address to backend...')

    // Confirm join
    const request = new Request("https://www.uma.rocks/api/join", {
        method: "POST",
        body: JSON.stringify({ delegateAddress, stakerAddress, umaStake }),
    });

    fetch(request)
            .then(res => res.json())
            .then(data => {

                if (data.errorMessage) {
                    logError(`Returned error in api/join fetch call: ${data.errorMessage}`);
                } else {
                    console.log('Returned message in api/join fetch call:');
                    console.log(data);
                }

            });
}