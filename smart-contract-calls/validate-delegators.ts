import { PrivateKeyAccount, PublicClient, WalletClient } from 'viem'
import { umaContractAbi } from '../test/umaAbi'
import { umaContractAddress, createPublicEthClient, createRedisInstance, logError, getDelegateAccounts, createWalletEthClient, ZERO_ADDRESS, removeDelegator } from './common'
import { Redis } from '@upstash/redis'
import { createOctokit, updateGithubSecret } from './github'


const delegateAccounts = getDelegateAccounts()

if (delegateAccounts.length == 0) {
    throw Error('No delegate account detected. Exit job.')
}

const publicClient = createPublicEthClient()
const walletClient = createWalletEthClient()
const redis = createRedisInstance()

for (let i = 0; i < delegateAccounts.length; i++) {

    await validateDelegator(delegateAccounts[i], redis, publicClient, walletClient)
    
}


// If delegator is invalid, remove it and return false. Do nothing and return true otherwise.
export async function validateDelegator(delegateAccount: PrivateKeyAccount, redis: Redis, publicClient: PublicClient, walletClient: WalletClient): Promise<boolean> {

    const delegateAddress = delegateAccount.address
    const shouldRemove = await shouldRemoveDelegator(delegateAddress, publicClient)

    if (shouldRemove) {

        // Remove from our backend
        const delegatorAddress = await deleteMemberFromBackend(delegateAddress, redis)

        // Uncomment line below to remove delegator from UMA smart contract
        await removeDelegator(delegateAccount, publicClient, walletClient)

        // Post message on Discord
        // const errorTitle = `Someone just left the pool 😢`
        // const errorMessage = `Delegator ${delegatorAddress} with delegate ${delegateAddress}`
        // await logError(errorMessage, errorTitle)

        return false
    }

    return true
}


// Returns removed delegator address
export async function deleteMemberFromBackend(delegateAddress: `0x${string}`, redis: Redis): Promise<`0x${string}`> {

    // Update Redis
    let [newK, delegatorAddress] = await deleteMemberFromRedis(delegateAddress, redis)
    
    
    // Update Github Secret
    if (newK) {
        
        const octokit = createOctokit()
        await updateGithubSecret(newK, octokit)

    }

    return delegatorAddress
}


export async function deleteMemberFromRedis(delegateAddress: `0x${string}`, redis: Redis): Promise<[newK: string, delegatorAddress: `0x${string}`]> {

    let newK: string = ''
    let delegatorAddress: `0x${string}` = ZERO_ADDRESS

    let delegatePrivateKey = ''
    let indexToRemove = -1
    let kvKey;
    let signature = 0
    let members


    // Remove from MEMBERS
    try {

        kvKey = 'MEMBERS'
        members = (await redis.get(kvKey) as any).all as any[]
        indexToRemove = members.findIndex(m => `0x${m.delegate}`.toLowerCase() == delegateAddress.toLowerCase())

        if (indexToRemove == -1) {
            logError(`Cannot find ${delegateAddress} in Redis MEMBERS key`)
            return [newK, delegatorAddress]
        }

        const memberToRemove = members[indexToRemove]
        delegatePrivateKey = memberToRemove.k as string
        delegatorAddress = `0x${memberToRemove.delegator}`
        signature = memberToRemove.signature

        members.splice(indexToRemove, 1)
        const newMembers = {
            all: members
        }

        await redis.set(kvKey, newMembers);

    } catch (err) {
        logError(`Cannot remove ${delegateAddress} from Redis MEMBERS key`)
        return [newK, delegatorAddress]
    }


    // Remove from K
    try {

        kvKey = 'K'
        newK = members.map((m: any) => m.k as string).join(',')
        await redis.set(kvKey, newK);

    } catch (err) {
        logError(`Cannot remove private key of ${delegateAddress} from Redis K key`)
        return [newK, delegatorAddress]
    }



    // Add to PENDING
    kvKey = 'PENDING'
    const oldPending: any[] = (await redis.get(kvKey) as any).all
    const newDelegate = {
        a: delegateAddress.slice(2), // removes '0x'
        b: delegatePrivateKey,
        signature
    };
    oldPending.push(newDelegate)

    const newPending = {
        all: oldPending
    }

    try {
        await redis.set("PENDING", newPending)
    } catch (err) {
        logError(`Cannot add delegate ${delegateAddress} to Redis PENDING key`)
        return [newK, delegatorAddress]
    }


    return [newK, delegatorAddress]
}

// Checks if the delegator still stakes, has the minimum UMA stake, & still has UMA.rocks as a delegate
export async function shouldRemoveDelegator(delegateAddress: string, publicClient: PublicClient): Promise<boolean> {

    const infos = await getDelegateInfos(delegateAddress, publicClient)

    /* ⚠️ IMPORTANT: Protection to avoid removing delegators if the query to the smart contract failed.
    Indeed, it could simply be a Viem bug or RPC client downtime.
    Therefore, it's not a proof that the delegator is invalid and we shouldn't remove it. */
    if (infos.stakerAddress === undefined || infos.umaStake === undefined || infos.existingDelegate === undefined) {
        return false
    }

    return infos.existingDelegate != delegateAddress || infos.umaStake < Number(process.env.MINIMUM_UMA_STAKE)

}

export async function getDelegateInfos(delegateAddress: string, publicClient: PublicClient): Promise<{ stakerAddress: `0x${string}` | undefined, umaStake: number | undefined, existingDelegate: `0x${string}` | undefined }> {

    let stakerAddress: `0x${string}` | undefined = undefined
    let umaStake: number | undefined = undefined
    let existingDelegate: `0x${string}` | undefined = undefined


    // Get staker address from delegate address
    let response;
    try {

        response = await publicClient.readContract({
            address: umaContractAddress,
            abi: umaContractAbi,
            functionName: 'delegateToStaker',
            args: [delegateAddress]
        });

    } catch (err: any) {
        logError(err)
        return {
            stakerAddress,
            umaStake,
            existingDelegate
        }
    }

    stakerAddress = response as `0x${string}`;
    // const shortenedStakerAddress = `${stakerAddress.substring(0, 6)}…${stakerAddress.slice(-4)}`
    console.log(`stakerAddress = ${stakerAddress}`)

    // Get UMA stake from staker address
    try {

        response = await publicClient.readContract({
            address: umaContractAddress,
            abi: umaContractAbi,
            functionName: 'voterStakes',
            args: [stakerAddress]
        });

    } catch (err: any) {
        logError(err)
        return {
            stakerAddress: stakerAddress,
            umaStake: 0,
            existingDelegate
        }
    }


    umaStake = Number((Number(BigInt((response as any)[0]) / BigInt(10 ** 15)) / 1000).toFixed(2));
    console.log(`umaStake = ${umaStake}`)

    existingDelegate = (response as any)[7] as `0x${string}`

    return {
        stakerAddress,
        umaStake,
        existingDelegate
    }

}