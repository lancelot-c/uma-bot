import { PrivateKeyAccount, PublicClient, WalletClient } from 'viem'
import { umaContractAbi } from '../test/umaAbi'
import { umaContractAddress, setDelegator, createWalletEthClient, createPublicEthClient, createRedisInstance, getPendingAccounts, logError, getLogs } from './common'
import { createOctokit } from './github'

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
    const logs = await getLogs(delegateSetEvent, args, publicClient, 4)


    if (logs.length > 0) {

        const latestLog = logs[logs.length - 1]
        // console.log('Latest DelegateSet event:')
        // console.log(latestLog);

        const latestDelegator = latestLog.args.delegator as `0x${string}`
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
            console.log(`✅ Accepting delegation request...`)
            const walletClient = createWalletEthClient()
            await acceptDelegationRequest(delegateAddress, latestDelegator, umaStake, account, publicClient, walletClient)
        } else {
            console.log(`🙅‍♂️ Delegation request ignored`)
        }



    } else {
        console.log(`No delegation request found`)
    }

}

async function acceptDelegationRequest(delegateAddress: `0x${string}`, stakerAddress: `0x${string}`, umaStake: number, account: PrivateKeyAccount, publicClient: PublicClient, walletClient: WalletClient) {
    
    const successful = await setDelegator(stakerAddress, account, publicClient, walletClient)

    if (successful) {

        // Post on UMA.rocks Discord
        const err = await postNewMemberOnDiscord(stakerAddress, umaStake)
        if (err) {
            logError(err)
        }

        await addToDatabase(delegateAddress, stakerAddress, umaStake) 
    }

}

async function addToDatabase(delegateAddress: `0x${string}`, stakerAddress: `0x${string}`, umaStake: number): Promise<void> {
    
    console.log(`Processing new staker ${stakerAddress} with delegate ${delegateAddress}`)

    const encryptedPrivateKey = await getDelegateEncryptedPrivateKey(delegateAddress)

    if (!encryptedPrivateKey) {
        logError(`Couldn't retrieve encrypted delegate private key for delegate ${delegateAddress}`)
        return;
    }


    // Update KV
    let [newValue, err] = await updateKV(encryptedPrivateKey, delegateAddress, stakerAddress, umaStake)
    if (err) {
        logError(err)
        return
    }

    // DEPRECATED: no more Github Secret
    // Update Github Secret
    // if (newValue) {
        
    //     const octokit = createOctokit()
    //     const success = await updateGithubSecret(newValue, octokit)

    //     if (!success) {
    //         logError(`Couldn't update Github Secret`)
    //         return
    //     }

    // }

}

async function getDelegateEncryptedPrivateKey(delegateAddress: `0x${string}`): Promise<string | undefined> {

    const pending: any = await redis.get("PENDING")
    const delegates: `0x${string}`[] = pending.all.map((elmt: any) => elmt.a.toLowerCase())
    delegateAddress = delegateAddress.toLowerCase() as `0x${string}`

    const index = delegates.indexOf(delegateAddress)

    if (index > -1) {

        const privateKey = pending.all[index].b as string
        return privateKey

    } else {
        return undefined
    }

}

async function updateKV(encryptedDelegatePrivateKey: string, delegateAddress: `0x${string}`, stakerAddress: `0x${string}`, umaStake: number): Promise<[string, string]> {

    let newKValue: string = ''
    let errorMessage: string = ''

    // Add to PRIVATE_KEYS
    const kvKey = 'PRIVATE_KEYS'
    console.log(`Add to ${kvKey}`)

    try {

        let oldValue = await redis.get(kvKey) as string;
        newKValue = oldValue

        // First key added
        if (!oldValue) {
            newKValue = `${encryptedDelegatePrivateKey}`
            await redis.set(kvKey, newKValue);
        }
        // Is not a duplicated key
        else if (!oldValue.includes(encryptedDelegatePrivateKey)) {
            newKValue += `,${encryptedDelegatePrivateKey}`
            await redis.set(kvKey, newKValue);
        } else {
            // Duplicated key, do not change KV
        }

    } catch (err) {
        errorMessage = `Could not add new member to ${kvKey}`
        return [newKValue, errorMessage]
    }


    // Remove from PENDING
    console.log('Remove from PENDING')
    let signature = 0
    const pending: any = (await redis.get("PENDING") as any).all

    const indexToRemove = pending.map((elmt: any) => elmt.a).indexOf(delegateAddress)

    if (indexToRemove > -1) { // only splice array when item is found

        const s = pending[indexToRemove] ? pending[indexToRemove].signature : 0
        signature = s ? s : 0
        pending.splice(indexToRemove, 1); // 2nd parameter means remove one item only

        const newPending = {
            all: pending
        }

        try {
            await redis.set("PENDING", newPending)
        } catch (err) {
            errorMessage = "Could not remove member from PENDING"
            return [newKValue, errorMessage]
        }

    } else {
        errorMessage = `${delegateAddress} not found in PENDING`
        return [newKValue, errorMessage]
    }




    // Add to MEMBERS
    console.log('Add to MEMBERS')
    const currentMembers: any[] = (await redis.get("MEMBERS") as any).all
    let found = false
    
    for (let i = 0; i < currentMembers.length; i++) {
        if (currentMembers[i].delegate.toLowerCase() == delegateAddress.toLowerCase()) {
            found = true;
            break;
        }
    }
    
    if (!found) {

        const newMember = {
            delegate: delegateAddress,
            pk: encryptedDelegatePrivateKey,
            delegator: stakerAddress,
            umaStake,
            signature
        };
        currentMembers.push(newMember)
    
        const newMembers = {
            all: currentMembers
        }
    
        try {
            await redis.set("MEMBERS", newMembers)
        } catch (err) {
            errorMessage = "Could not add member to MEMBERS"
            return [newKValue, errorMessage]
        }

    }

    return [newKValue, errorMessage]
}



function numberWithCommas(x: number): string {
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

async function postNewMemberOnDiscord(stakerAddress: `0x${string}`, umaStake: number): Promise<string> {

    // Post on UMA.rocks Discord
    console.log(`> Post message on Discord`)

    const umaPrice = await redis.get("UMA_PRICE") as number;

    const embed = {
        "title": `Someone just joined the pool with ${numberWithCommas(umaStake)} UMA ($${numberWithCommas(Math.round(umaStake * umaPrice))}) 🥳`,
        "description": `Welcome UMA holder ${stakerAddress} 👋`,
        "color": 1467700,  // dark green - decimal index of a color, see https://www.spycolor.com
    }

    const params = {
        // "content": ``,
        "embeds": [embed]
    }

    const webhookUrl = process.env.DISCORD_CHANNEL_GENERAL_WEBHOOK_URL as string


    let resolve: Function;
    const promise: Promise<string> = new Promise((r) => {
        resolve = r;
    });


    fetch(webhookUrl, {
        method: "POST",
        headers: {
            'Content-type': 'application/json'
        },
        body: JSON.stringify(params)
    }).then(res => {

        console.log(`Webhook response: { status: ${res.status}, statusText: ${res.statusText}, ok: ${res.ok} }`);
        resolve('')

    }).catch(err => {

        console.error(err)
        resolve(err)

    })

    return promise
}